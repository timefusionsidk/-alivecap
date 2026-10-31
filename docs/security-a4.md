# A4: guest abuse controls and CAPTCHA

This is a separate review chunk on top of PR #3 (`security/a1-a3-permissions-quotas`, commit `ddebb41`). It does not merge/deploy either PR, apply migrations to production, or enable Auth CAPTCHA settings.

## What changes and why

| Control                  | Behavior                                                                                                                                                                                                                    | Enforcement                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Event password failures  | Five failed password checks within 15 minutes cause a 15-minute lockout, using a rolling failure history, independently per event/auth identity and per event/device UUID. A correct password cannot bypass an active lock. | `join_event` wrapper, before calling the internal bcrypt/admission function |
| Repeated valid joins     | At most 20 evaluated join requests per auth user/event per minute; reaching the ceiling causes a one-minute lockout.                                                                                                        | Private request counter, before the aggregate event budget                  |
| Aggregate event throttle | At most 120 evaluated joins per event slug/minute, then a one-minute cooldown. This also bounds password checks while clients rotate identities.                                                                            | Private slug counter, before bcrypt                                         |
| Upload burst             | At most 10 registered photos/videos per guest in the preceding 60 seconds.                                                                                                                                                  | AFTER INSERT trigger on `photos`                                            |
| Comment burst            | At most 20 comments per guest in the preceding 60 seconds.                                                                                                                                                                  | AFTER INSERT trigger on `comments`                                          |
| Anonymous signup abuse   | Turnstile or hCaptcha token is passed to `signInAnonymously({ options: { captchaToken } })`; Supabase Auth validates it when CAPTCHA protection is enabled.                                                                 | Reusable client widget plus Supabase Auth's server-side verification        |

These thresholds are implementation defaults, not measured production traffic requirements. Change them in a new migration if real events need different limits.

A missing device ID cannot bypass the authenticated-user limit. A supplied UUID is normalized for hashing; rotating it does not reset user failures. The device identifier is a client-controlled browser hint, not a trusted hardware identity. CAPTCHA and Supabase's Auth/IP limits are still needed against rotating anonymous accounts. No claim is made that this eliminates distributed denial of service.

Wrong passwords return JSON so counter updates commit normally. The fifth failure returns `error_code: rate_limited` and `retry_after_seconds: 900`. Active blocks are checked without extending their deadlines. Successful joins do not erase recent failures. Locks are event-scoped: mistakes at one event do not lock a guest out of an unrelated event. Already-blocked identities do not consume the aggregate event allowance or allocate new device rows.

The join form disables submission during the returned cooldown, while the database remains authoritative. It reuses existing host/guest sessions, shows CAPTCHA only when a new anonymous session is needed, clears stale tokens, and offers verification retries. Host email login, signup and password-reset request forms also forward tokens, so enabling project-wide CAPTCHA does not leave those flows unprepared. OAuth and existing-session password updates keep their existing supported API flow.

## Migration and RLS

New migration: `supabase/migrations/20261031084117_guest_abuse_controls.sql`.

- Adds `event_join_attempts`, keyed by event, scope and SHA-256 subject hash. No passwords, CAPTCHA tokens, email addresses or raw device identifiers are stored in these counters. A hash of a random browser identifier is pseudonymous, not guaranteed anonymous.
- Adds `guest_write_attempts`, an immutable successful-write ledger with a server-generated clock timestamp, indexed by guest/action/time. Client-supplied photo/comment timestamps cannot evade the rolling window. Deleting content does not reset the ledger.
- Both tables have RLS enabled, no client policies and all privileges revoked from PUBLIC, anon and authenticated. They are intentionally private bookkeeping, not host-facing analytics tables.
- Renames the A3 `join_event` implementation to `join_event_core_a4` and revokes its client execution rights. The new public wrapper preserves the original RPC signature and invokes the inaccessible core only after throttling. The core still owns password verification, blocked-guest handling and guest-capacity enforcement.
- All added SECURITY DEFINER functions use `SET search_path = public`. Internal trigger/maintenance/core functions cannot be called by clients. The sole new entrypoint with an authenticated EXECUTE grant is the existing `join_event` API name; it verifies `auth.uid()`.
- Uses the A3 event-row lock for admission counters. Write triggers use a per-guest transaction advisory lock after the A3 photo accounting trigger has acquired the event lock, avoiding a reversed event/guest lock order.
- A rate-limit exception rolls back the inserted content, ledger entry and A3 quota charge together. The existing A3 upload helper attempts Storage API cleanup after failed registration.
- Host-only rows with `guest_id = NULL` are outside guest allowances; existing RLS decides whether such inserts are authorized. This is not a limit on trusted host operations.

The migration includes a complete executable rollback block in a SQL comment. Tests execute that block and rerun the A1–A3 SQL regressions. Rollback discards abuse bookkeeping, restores the original A3 function name/grants, and does not delete event content. Existing migrations and published git history are untouched.

`prune_abuse_attempts(batch_size)` is a trusted maintenance hook, with no PUBLIC/anon/authenticated execution rights. It removes up to `batch_size` records from **each** table (default 5000, maximum 10000 each) older than one day, preserves active locks, uses SKIP LOCKED and never deletes content. A DB operator can run:

```sql
SELECT public.prune_abuse_attempts(5000);
```

Schedule it daily in a trusted database scheduler and repeat batches until the returned count is below the combined batch ceiling when backlog warrants it. Scheduling is not activated by this chunk; pg_cron setup remains in C8. Event/guest deletion also cascades the associated counter records. Without maintenance, expired records stop affecting enforcement but remain stored.

### Limits of this chunk

Upload limits count **registered media**, not raw Storage HTTP requests. An adversary can still upload without registering or leave an orphan after a network failure; reservations, direct signed uploads and orphan reclamation remain A6. This chunk preserves the A3 accounting scope rather than claiming full physical Storage admission control. Rate limits are successful-write limits; failed writes roll back and do not permanently consume the allowance. Multi-row inserts that cross a ceiling roll back atomically.

Request/aggregate counters use fixed one-minute windows with explicit one-minute cooldowns; password failures and write allowances use rolling histories.

No generic IP header is trusted as identity. Edge request throttling/WAF and Supabase's native Auth limits complement these database checks. CAPTCHA protects creation of anonymous identities; an already-issued session still needs the join/write database controls.

## Exact code changes

See this PR's **Files changed** tab for complete unified diffs and all new file contents.

- `src/lib/auth/captcha-config.ts`: parse public provider/site-key configuration. Both absent means disabled; invalid or half-configured values fail closed in the UI.
- `src/lib/auth/captcha-client.ts`, `src/components/auth/captcha-challenge.tsx`, `src/lib/auth/use-auth-captcha.ts`: official-script loader, deduplication, timeout/error/retry handling, compact accessible widgets, expiry handling and single-use token reset. No new runtime dependencies.
- `src/lib/auth/anonymous-session.ts`: independently testable session reuse and token forwarding, without importing generated integration files.
- `src/lib/guest/use-guest.ts`: delegates anonymous creation and subscribes to auth changes so a newly created session is reused on password retries.
- `src/routes/join.$slug.tsx`: verification UI, safe cooldown handling and removal of join debug logs.
- `src/lib/guest/guest.functions.ts`: preserves the limiter's safe error code and retry interval in the server response.
- `src/lib/guest/rate-limit.ts`, `gallery.functions.ts`, `upload-photo.server.ts`: map only exact database limiter codes to friendly upload/comment messages; registration rejection keeps A3 compensating cleanup.
- `src/lib/auth/auth-context.tsx`, `auth-errors.ts`, and the three host email auth forms: optional CAPTCHA arguments, token forwarding, reset and safe rejection messages.
- `.env.example`: public settings only. No provider secret, privileged Supabase credential or real key was added.
- `tests/helpers/database.mjs`: shared real PostgreSQL/pgcrypto migration-replay harness; the A1–A3 suite now uses actual bcrypt too.

Generated `src/integrations/supabase/*.ts` and `routeTree.gen.ts` stay unchanged. The unused generated service-role client reference documented in A1–A3 remains a Lovable-side follow-up; no privileged key is used by these changes.

## CAPTCHA setup and activation

This is configuration-ready code. It is **not enabled on production** by this PR, and it has not been verified with the user's real provider credentials.

1. Create either a Cloudflare Turnstile widget or an hCaptcha site and allow the real alivecap hostname(s). Use official testing credentials only in local/staging environments; never deploy always-pass test credentials to production.
2. Set both **public build-time** environment variables and deploy this frontend before enabling the backend toggle:

   ```dotenv
   VITE_AUTH_CAPTCHA_PROVIDER="turnstile"
   VITE_AUTH_CAPTCHA_SITE_KEY="your-public-site-key"
   ```

   For hCaptcha, set the provider to `hcaptcha` and use that site's public key. Leave both empty only when intentionally retaining the CAPTCHA-disabled deployment. A partially configured pair blocks new signup/sign-in UI instead of silently allowing unverified signup. Existing sessions remain reusable on the join screen.

3. In [the target project's Auth protection settings](https://supabase.com/dashboard/project/hjaetiwuchmdzcghoowo/auth/protection), open **Bot and Abuse Protection**, enable CAPTCHA protection, choose the matching provider and store its **secret key in Supabase Auth settings only**. Do not put that secret in Vite variables, repository files or browser code. Enable anonymous sign-ins under Auth providers if not already enabled.
4. Use a fresh browser session to verify guest join, host login, signup and reset-email requests. Inspect that `captchaToken` is passed in the Auth request, without copying it into logs. An anonymous signup request with a missing/expired/invalid token must fail at Supabase Auth even if the caller bypasses this UI. Verify successful challenge, expiry, failed verification and retry.
5. Existing sessions and OAuth redirects have different flows; confirm they still work. Both frontend settings and backend provider selection must agree. If scripts are blocked, the form must remain blocked with a retry option. Coordinate any rollback of CAPTCHA settings across frontend and backend so new sessions are not stranded.

Supabase verifies tokens server-side; merely adding a widget/site key does not activate protection. Provider secrets are not application environment variables in this design.

A8's CSP must include the chosen provider's official script/frame/connect domains. For Turnstile, account for `https://challenges.cloudflare.com`. For hCaptcha, follow its documented `https://hcaptcha.com` / `https://*.hcaptcha.com` requirements rather than pinning transient asset subdomains. No CSP is changed in A4.

Primary references checked during implementation:

- [Supabase CAPTCHA setup](https://supabase.com/docs/guides/auth/auth-captcha)
- [Supabase anonymous signup token option](https://supabase.com/docs/reference/javascript/auth-signinanonymously)
- [Cloudflare explicit rendering, reset and remove](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)
- [hCaptcha JavaScript configuration](https://docs.hcaptcha.com/configuration)

## Tests and validation

```sh
bun install --frozen-lockfile
npm test
npm run test:security
npx tsc --noEmit
npm run build
```

Validation completed: frozen bun install; 19 automated checks; TypeScript; production build; targeted ESLint with zero errors and one Fast Refresh warning in the existing auth-context file. No real CAPTCHA-provider or multi-connection browser/device staging tests were run.

`npm test` runs 19 checks, including the existing tests, SQL migration replay, real bcrypt lockouts, executable rollback, CAPTCHA configuration/token/session/script-loader tests and exact limiter error mappings. The SQL suite exercises limits through the same functions/triggers that direct Data API callers use. Platform Auth/Storage schema fixtures stand in for Supabase services; no live credentials are required. A read-only baseline advisor scan on the unchanged live project still reports the existing callable-definer notices and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). It does not validate this unapplied migration.

The engine serializes queries, so real multi-connection contention and HTTP/provider verification remain staging checks.

Run `supabase/tests/a4_abuse_controls.sql` only on a disposable local/staging database after A1–A4, with `psql -v ON_ERROR_STOP=1 -f supabase/tests/a4_abuse_controls.sql`. It rolls back its fixtures. It should not be run on active production.

## Manual staging checklist (not yet performed)

- [ ] Land/deploy A1–A3 first, then apply only this new migration. Respect the target's historical migration-version mismatch described in `security-a1-a3.md`; do not run a blanket historical db push.
- [ ] Five wrong event passwords → lockout and cooldown. Correct password, a different device ID on the same account, or another account with the same device ID must not bypass it. Other independent guests/events should remain usable.
- [ ] Refresh during cooldown and retry via direct RPC: enforcement must remain server-side. After expiry, joining should recover without manually clearing data. Blocked retries must not extend lock deadlines.
- [ ] Send simultaneous wrong-password requests and rapid valid rejoins from separate connections. Confirm five-failure, 20-request and 120-event ceilings; check that row locks prevent lost counter updates.
- [ ] A guest can register 10 tiny photos but not an eleventh within 60 seconds. The rejected row/quota increment rolls back and the normal upload flow cleans up the unregistered object. Another guest has a separate allowance.
- [ ] A guest can post 20 comments but not a twenty-first in 60 seconds. Spoofing `created_at`, deleting content or calling Data API directly must not reset limits. Verify recovery after the rolling window and atomic rejection of an oversized multi-row insert.
- [ ] Counter tables and the core/prune RPCs reject anon/authenticated direct access. Verify maintenance removes only old records in bounded batches and preserves active blocks/content.
- [ ] Activate one real CAPTCHA provider on staging; test anonymous signup, host login, signup and reset request, plus token expiry, denial, retry, script timeout and blocked-script behavior. Confirm existing sessions do not create a replacement anonymous identity.
- [ ] Test keyboard navigation, screen-reader error/status announcements, compact widget layout on narrow phones and no leaked CAPTCHA tokens in logs.
- [ ] Rerun the target security advisors after deployment; private RLS-enabled tables without policies are intentional. Review only newly introduced findings, plus the pre-existing generated-client/Auth configuration follow-ups.
