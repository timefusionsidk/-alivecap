# AliveCap redesign — implementation and verification

## Source and architecture

Imported from the user-supplied `alivecap-4eae2109-main (1).zip`. The original Git history was not included. The baseline import is retained in its own commit. New remote: `https://github.com/timefusionsidk/-alivecap.git`.

React 19, TypeScript, TanStack Start SSR/file router, Vite 8, Tailwind 4, Radix/shadcn, React Query, Supabase Auth/Postgres/Storage/Realtime. npm is documented in the original README; its supplied package-lock was stale and required repair. Nitro's existing Vercel preset remains; no SPA rewrite was introduced.

## Actual feature inventory (source, not README aspirations)

- `/` dispatches to host dashboard or login; no marketing landing page existed.
- Email/password login/signup, Google login, verification callback, forgot/reset password and legacy login/signup aliases.
- Host `/dashboard`, `/events/new`, `/events/:id`, `/events/:id/photos`, `/events/:id/settings`, `/camera-check`.
- Creation: name, description, venue, date, password, upload/download/comment/like permissions.
- Event overview: photo/guest/download/report counts, QR joining links, PNG QR download, server-created ZIP exports.
- Settings: original creation fields, draft/active/archived status, videos and EXIF switches, password changes, archive confirmation. Archive action also soft-deletes; this is retained.
- Host photos: pagination, all/pinned/featured/reported/hidden filters, multiselect and batch moderation, hide/restore/pin/unpin/feature/unfeature/soft-delete.
- `/join/:slug`, `/e/:slug`, `/e/:slug/camera`, `/e/:slug/gallery` and legacy `/camera/:code` and `/gallery/:code` redirects.
- Anonymous authenticated guest sessions; database password verification; event membership and RLS. Host accounts can join as guests without being signed out when leaving.
- Live camera: getUserMedia, flip, conditional torch, 20 filters, JPEG canvas capture, file upload fallback and upload tray. The existing app intentionally mirrored saved selfies (explicit code comment); retained.
- Guest gallery: paginated approved photos, likes/comments, fullscreen-style viewer, autoplay slideshow, realtime invalidation. No guest download/share button, album screen or guest-management screen existed.
- Host camera diagnostics: permission/device/quality checks, snapshots and local downloads; retained.
- Manifest existed; no service worker, durable offline upload queue or offline photo cache existed. Offline uploads are not claimed.

## Redesign

Shared warm-dark tokens and Hanken Grotesk / Instrument Serif; original opaque logo assets retained. Wordmark is framed around its actual printed bounds. Icon assets at 32/180/192/512 plus ICO; supplied icon's central artwork fits the maskable safe zone.

84px desktop rail, safe-area mobile navigation at 760px, contextual host destinations and separate guest navigation. Real event rows and owner-scoped recent thumbnails; genuine backend counts/storage. Reusable QR card uses persisted slug and `VITE_PUBLIC_APP_URL` (current origin fallback for local development). All existing creation/settings fields remain.

Gallery photographic frames and aspect ratios, labelled dialogs, keyboard browsing, typing-safe shortcuts, host viewer with persisted moderation, slideshow branding. Camera portrait frame, grid, actual 3-second timer, offline/upload permission state, failed-upload retry and stale media-request cleanup. The 20 production filters match the supplied HTML definitions exactly; processed captures are never filtered a second time.

## Correctness and security

Camera reads/uploads now carry the route slug instead of using the most recently joined event. Host server functions reject anonymous sessions explicitly in addition to existing RLS. Google OAuth uses the existing Supabase project's provider, preserving sanitized callback destinations. Redirect sanitization rejects backslashes and control characters.

Guest images use authenticated POST reads with `private, no-store` streamed responses after photo/membership checks; blob URLs are revoked. Existing thumbnails are used where available. Guest metadata refresh and realtime updates remove photos whose visibility changes. Already downloaded bytes cannot be recalled from a device.

An existing storage security defect was found: per-bucket `deny_client_*` policies are permissive and OR together; the later event-media read policy also allowed any photo within a joined event. The added **access-policy-only migration** removes those permissive policies and restricts guest storage reads to approved, nondeleted photos. It does not change tables/columns or backend providers.

**Required before release:** apply only `supabase/migrations/20261024070000_protect_moderated_storage.sql` to the existing project after reviewing its current policies. It has not been applied by this task. Do not replay historical migrations against production: an old migration includes test-data deletion statements. Previously issued signed URLs may remain valid until expiry. Verify hidden-photo access with a guest session and a direct authenticated Storage request after applying the policy correction.

## Provider/deployment configuration

- Keep all existing `VITE_SUPABASE_*` and server `SUPABASE_*` names. `.env` is ignored and never committed.
- Set `VITE_PUBLIC_APP_URL` to the canonical HTTPS application origin.
- Enable/configure Google in Supabase Auth with the existing project credentials. Allow the deployed `/auth/callback` and local testing callback URLs. Keep reset/verification redirect URLs allowed. No new backend provider is needed.
- Enable anonymous sign-ins for guest access as required by the existing product.
- Vercel build command stays `npm run build`; use the existing Nitro Vercel preset. No production deployment or merge is authorized.
- The existing upload API accepts base64 photos larger than Vercel's request limit. Large file uploads remain a pre-existing deployment concern; the redesign does not reduce capture quality to conceal it.

## Verification log

- Standard build and Vercel-preset build passed; TypeScript passed; redirect tests: 2 passed.
- Full repository lint has inherited formatting/style failures (967 reported before targeted cleanup). Changed-file lint passed with two warnings (existing button Fast Refresh exports and camera generation-ref cleanup).
- Signed-in host created disposable event AliveCap redesign verification (b838a23d-97b0-4a58-84bd-d0f4cb7ebf41). Guest joined its persisted link; supplied app icon uploaded successfully and displayed through protected image reads. No pre-existing event/photo was altered.
- Verified settings venue persistence after refresh, photo hide/restore across host and guest gallery, likes and comment persistence, Escape and focus restoration. Realtime subscription connected.
- Physical capture remains unverified: system camera permission was denied in the original tab; the dedicated review tab awaited permission. No synthetic camera was substituted.
- Password recovery, Google provider configuration, separate anonymous-account authorization, ZIP exports and direct Storage RLS after the pending migration remain unverified.
- Disposable event/photo/comment are retained for review. Screenshots show actual test data, not fabricated photography.
- npm reported 15 inherited dependency vulnerabilities; no forced upgrades were applied.
