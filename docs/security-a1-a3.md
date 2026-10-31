# A1–A3: profiles, event permissions and quotas

Target: `https://hjaetiwuchmdzcghoowo.supabase.co`. Source baseline: `main` at `a5bf90a`.
Only A1–A3 are implemented in this chunk. No production database migration, merge or deployment was performed.

## Changes and migration files

| Item | New migration                                       | Why / resulting behavior                                                                                                                                                                                                                                                                                                                        |
| ---- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1   | `20261031070931_restrict_user_profile_updates.sql`  | Only `full_name` and `avatar_url` are writable by authenticated users. Existing owner RLS remains. Table and legacy column grants are cleared; unsafe direct INSERT/DELETE/TRUNCATE grants are removed.                                                                                                                                         |
| A2   | `20261031070941_restrict_event_mutations.sql`       | Hosts retain ordinary event settings and creation fields. They cannot supply or update quotas, usage, guest limits, expiry, ownership on update, or deletion timestamps. Archiving uses `archive_owned_event(uuid)`, which checks identity, host status, ownership and existence.                                                               |
| A3   | `20261031070950_enforce_media_and_guest_limits.sql` | Private bucket limits/MIME allowlists; real Storage metadata determines registered original and thumbnail sizes; atomic event-row locking; capacity enforcement in join_event and direct guest inserts; immutable registrations/registered-object replacement; corrected host Storage policy; compensating cleanup of own unregistered uploads. |

Each migration includes commented rollback SQL. Rollback deliberately keeps the corrected host policy and does not restore unnecessary public/anon/TRUNCATE privileges. Previous inaccurate counter values cannot be recovered by rollback. Roll back the A2 caller and migration together.

### Exact application changes

- `src/lib/admin/admin.functions.ts`: `archiveEvent` calls the owner-checked RPC through a server-only helper rather than directly updating `deleted_at`.
- `src/lib/admin/archive-event.server.ts`: typed local RPC extension and error propagation. No generated types were changed.
- `src/lib/guest/guest.functions.ts`: existing authenticated session checks remain; delegates media upload and registration to a server-only helper.
- `src/lib/guest/upload-photo.server.ts`: allowlisted JPEG/PNG/WebP/HEIC/HEIF upload; 15 MiB maximum; random immutable object path; normal registration; attempts Storage API cleanup if registration rejects or throws. Cleanup failure emits a structured code without logging tokens, image data or raw backend messages.
- `supabase/config.toml`: corrected project reference.
- `package.json`, `bun.lock`, `package-lock.json`: pinned test-only PGlite dependency and Node test scripts. npm lockfile's missing optional dependencies repaired; no framework upgrade requested or made.

The PR's **Files changed** tab is the unified diff and includes full contents for every new file.

## Decisions / assumptions

- Existing `*_mb` quota fields use MiB: 1,048,576 bytes. No rounding before enforcement.
- Photos: 15 MiB; thumbnails: 5 MiB; videos: 50 MiB. Videos accept MP4/WebM; actual video capture/upload permissions remain for C6. The global Storage limit must be at least 50 MiB.
- Existing limits remain: default event storage is 5120 MiB; `guest_limit = NULL` means unlimited, zero denies new admissions. New plan-specific defaults belong to C10.
- A guest consumes one seat including when blocked. Rejoining the same auth identity does not consume another seat. Block/unblock therefore cannot inflate capacity.
- Original and thumbnail metadata determine `quota_bytes`. `size_bytes` retains the original file's size. Photo identity/path/size are immutable after registration. Soft delete, hide and reject keep bytes charged. Hard row deletion refunds that row's registered bytes.
- Backfill includes all existing photo rows, including soft-deleted ones. Missing legacy objects fall back to existing nonnegative `size_bytes`; duplicate registrations cause migration failure rather than data deletion. The confirmed target had zero events, photos and objects during inspection.
- Limits check the locked event state so parallel registrations/admissions cannot both spend the last slot. The embedded test engine runs queries serially; true multi-connection load testing is in the staging checklist below.

## Scope limits and generated-file conflict

A3 enforces **registered media accounting**, not a complete physical-bucket quota. A caller can still upload an object without registering a photo. Network failure can also strand an orphan, and a hard-deleted row can leave its original behind. A6 must introduce a bounded reservation/finalization lifecycle and orphan reclamation; C9 must remove physical objects via Storage APIs. SQL must never delete Storage metadata as a substitute for deleting object bytes.

Bucket MIME restrictions and Storage metadata are not image magic-byte verification. A6 owns the signed upload transport, real byte validation and registration RPC. The existing ~20 MB data-URL request transport remains until A6. HTTP upload admission, Supabase Auth, JWT validation, bcrypt and Realtime are not simulated by these tests.

`src/integrations/supabase/client.server.ts` is an existing generated module that references a service-role environment variable. No call sites import it outside the integrations directory. It is left untouched under the user's generated-file constraint. No key was fetched, added, committed or used. Lovable should regenerate/remove this unused privileged client before declaring the entire codebase compliant with the no-service-role requirement. All changed paths use the caller's RLS-scoped client and publishable key.

Generated Supabase files and `routeTree.gen.ts` are unchanged. A4–A9, B and C remain outstanding. In particular, the expired-event SQL test here proves upload/join rejection; expiry enforcement for all reads, likes, comments and download grace belongs to A5. Previously issued signed URLs do not immediately lose validity when a guest is blocked; these tests prove fresh RLS checks, not revocation of existing signed URLs.

## Verification

Automated checks:

```sh
# Node >=22.18 recommended; bun is the application package manager.
bun install --frozen-lockfile
npm test
npx tsc --noEmit
npx eslint src/lib/admin/archive-event.server.ts src/lib/guest/upload-photo.server.ts src/lib/admin/admin.functions.ts src/lib/guest/guest.functions.ts
npm run build
```

`npm test` runs 10 checks, including a SQL suite with many assertions. The suite replays all actual repository migrations on PGlite PostgreSQL 17.5 with platform Auth/Storage schema fixtures, then rolls back its data. The A4 follow-up now loads the bundled pgcrypto extension and reuses this suite unchanged; the original A1–A3 run used passwordless fixtures. Auth/Storage HTTP services are not emulated.

`supabase/tests/a1_a3_security.sql` can also run on a disposable local Supabase stack with `psql -v ON_ERROR_STOP=1 -f supabase/tests/a1_a3_security.sql` after all migrations. It inserts metadata-only Storage fixtures and rolls everything back. Never use it against an active production project.

Coverage: allowed profile/settings writes; plan/quota/owner/expiry/deletion/creation injection denial; TRUNCATE denial; normal event creation; owner and foreign-owner archive; capped admission and rejoin; direct-host cap bypass; spoofed sizes; exact quota and one-byte overflow; thumbnail accounting; missing/duplicate object registration; event isolation; blocked access; expired uploads/joins; soft vs hard deletion accounting; host object reads; registered object immutability; guest orphan cleanup. Helper tests cover upload failure, rejected/thrown registration and cleanup, invalid MIME/encoding/size, RPC arguments and failure propagation. Broad Vitest/Playwright flows requested in A9 remain for that chunk.

A read-only production advisor scan reported the deliberately callable SECURITY DEFINER helpers and disabled leaked-password protection. The former require reviewing each function's scope, not blindly granting or revoking privileges. No Auth configuration was changed. Reference: [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) and [definer advisor](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## Deployment / migration history

The target's existing migrations were applied as `20261026074121` through `20261026074232`, with an extra `20261026074249_alivecap_create_private_storage_buckets`. Repository historical filenames retain their original July–October versions. No historical files or applied migration records were rewritten.

**Do not run a blanket `supabase db push` at this target.** It could attempt to rerun old schema creation and cleanup SQL. Review/reconcile historical identities against function/table definitions first, without replaying them. For this chunk, deploy only the three new migrations in order using the controlled migration runner; record their versions exactly once. Do not reapply the historical migrations. Coordinate A2 migration and application release: old `archiveEvent` cannot directly update `deleted_at` after A2.

A1 and A3 can be deployed independently of the new archive caller. For A2, briefly disable the archive action during rollout or deploy an application version capable of detecting the new RPC before enabling the privilege restriction. Do not expose a fallback that regains direct protected-column writes.

## Manual staging checklist (not yet performed)

- [ ] Confirm project reference and both browser/server publishable-key configuration point at the target. No privileged keys.
- [ ] Reconcile migration identities; apply just the three new migrations on staging. Run the SQL suite on a disposable stack and rerun security advisors.
- [ ] Host login → create event → change every settings field, including adding/changing/removing password. Archive own event; confirm guest join/gallery closes and dashboard hides it.
- [ ] Attempt `users.plan`, event quota/usage/guest_limit/expiry/owner/deleted_at changes and custom quotas at event creation via authenticated Data API. Expect permission denied.
- [ ] Set guest limit 1 administratively. Two fresh anonymous sessions join simultaneously: exactly one new guest. Accepted identity rejoins successfully; blocked identity fails. Repeat with zero and NULL limits.
- [ ] Set quota 1 MiB administratively. Two sessions register ~700 KiB each simultaneously: exactly one succeeds; failed normal camera upload is removed. Verify counter, row count and Storage objects. Repeat with a thumbnail crossing the cap.
- [ ] Upload allowed images; try oversize files and disallowed MIME via the Storage HTTP API. Confirm actual Storage rejection and the global limit.
- [ ] Guest A can see its own event and not B's media. Blocking A denies fresh row/object reads immediately. Verify own orphan cleanup works but cannot remove registered media or another guest's object.
- [ ] Host can view hidden/rejected photos, pin/hide/restore/delete through existing moderation. None of these soft actions refund bytes. Replacing a registered object via upsert is denied.
- [ ] Expire event administratively: new joins and uploads fail. Record the remaining A5 read/like/comment gaps rather than marking full expiry enforcement complete.
- [ ] Confirm no generated files changed; inspect client/server bundles for forbidden credential usage. Camera capture on iOS/Android and full gallery interaction remain browser/device QA for A9/B.
