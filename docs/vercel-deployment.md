# AliveCap — Vercel deployment and release checklist

AliveCap is a **TanStack Start SSR app** with Nitro server functions, Supabase Auth, Postgres, and private Storage. It is **not a static Vite SPA**. Do not add a catch-all SPA rewrite or set `dist` as Vercel's output directory.

## Git integration

1. Connect `timefusionsidk/-alivecap` to the intended Vercel project. Check for duplicate projects (`alivecap`, `-alivecap`) before connecting a new one.
2. Set the root directory to the repository root.
3. Select the **TanStack Start** framework preset. This is also declared in `vercel.json`.
4. Use `npm ci` (install) and `npm run build` (build). Do **not** override the output directory: Nitro creates the Vercel Build Output.
5. Use Node.js **22.x** in Vercel Project Settings, consistent with `.nvmrc`.
6. Connect the production branch only after the PR verification workflow passes. Use a preview deployment first.

The repository's `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, which already wires up the Vite plugins, TanStack Start, and Nitro. When `VERCEL` is set, it selects the Vercel Nitro preset. Do not add duplicate plugins.

## Required environment variables

Add these values to the **Preview** and **Production** environments in Vercel, taking them from the existing Supabase project. Never commit them to the repository or send them in chat.

| Name | Scope | Use |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Public (build-time) | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public (build-time) | Supabase publishable key, **not** secret or service-role |
| `SUPABASE_URL` | Server | Same Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Server | Same publishable key for request-scoped RLS queries |
| `VITE_PUBLIC_APP_URL` | Public (build-time) | Canonical HTTPS origin for QR/invite links, **no path** |
| `VITE_SUPABASE_PROJECT_ID` | Optional public | Project reference |
| `SUPABASE_PROJECT_ID` | Optional server | Project reference |

The application should **not require a service-role credential** for guest and host operations. Never expose `SUPABASE_SERVICE_ROLE_KEY` or `sb_secret_...` as a `VITE_` variable.

Set all `VITE_` values before building: Vite embeds them into browser bundles. A redeploy is required after changing build-time values.

In **Supabase Authentication → URL Configuration**, add the deployed site origin and allow the auth callback and recovery redirect URLs under that origin; configure Google OAuth only if this feature is enabled. **Enable anonymous Auth sign-ins** for guest sessions.

## Database security prerequisite

**Do not run every historical migration against a live project.** The repository already contains older test-data deletion statements. Before release, review and apply only the outstanding `supabase/migrations/20261024070000_protect_moderated_storage.sql` policy correction to the actual Supabase project if it has not been applied. Verify guest access to approved photos and denial for hidden/deleted photos.

Never perform migrations solely because a Vercel build succeeded.

## Camera-upload limitation

The existing `uploadGuestPhoto` function sends an entire base64 photo to a TanStack server function, and allows input substantially larger than Vercel's approximate 4.5 MB request payload limit. **This remains a known production limitation**: high-resolution and gallery-import uploads may fail with HTTP 413 even when Vercel deployment succeeds.

Before declaring the app launch-ready, migrate photo bytes to **direct authenticated Supabase Storage uploads** under the existing guest/event RLS policies, with a small server-only metadata-finalization call and appropriate cleanup/validation. Do not reduce the photo resolution silently to work around platform limits. Test real camera photos and large gallery imports on the Vercel preview deployment.

Similarly, ZIP export generation currently runs synchronously within a server function; large events may exceed memory/duration limits. Verify representative exports before promising scale.

## Build and smoke tests

Locally:

```sh
npm ci
npx tsc --noEmit
node --test tests/*.test.mjs
VERCEL=1 npm run build
```

The CI workflow runs these checks, then confirms that Nitro emitted `.vercel/output/config.json`. The absence of build logs is not proof of a working deployment.

After deploying a **preview**, verify at minimum:

- `/` and `/auth/login` render after a direct reload.
- Auth sign-in, sign-up verification callbacks, and password reset return to the correct origin.
- A host can create an event and load `/events/:id` and settings.
- A guest can join `/join/:slug` anonymously, use `/e/:slug/camera`, and view `/e/:slug/gallery`.
- Camera permission prompts only after user interaction when required; fallback photo imports work.
- A normal photo uploads; separately test a photo large enough to exercise the documented Vercel upload-size limitation.
- Photo moderation, access control, comments, likes, and ZIP exports behave correctly.
- QR codes point at the intended production URL, not Lovable or a preview domain.
- Run Vercel runtime error inspection after exercising each flow.

Do not promote a preview or merge to `main` until its actual build/runtime status and the production-data security prerequisite are verified.
