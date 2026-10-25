
# alivecap — Build Plan

This is a large, production-grade spec. I can't ship the full 20-section platform in one turn without producing a broken, half-wired codebase. I'll build it in coherent, working phases — each phase leaves the app deployable and testable. Confirm the phase order (or reshuffle) and I'll start on Phase 1.

Note on stack: your spec says "React 18 + Vite + React Router-style pages". This project is scaffolded on **TanStack Start v1 + React 19 + Tailwind v4 + Lovable Cloud (Supabase)**, which is functionally equivalent (routing, SSR, server functions). I'll use it instead of swapping frameworks — same capabilities, better fit for the template. Everything else (Supabase, Tailwind, shadcn, Framer Motion, React Query, RHF+Zod, PWA, WebGL/CSS filters) stays exactly as specified.

## Phase 1 — Foundation (backend + design system + auth)
- Enable Lovable Cloud
- Full DB schema (all 15 tables), triggers, indexes, RLS policies, `current_guest_id()` fn, `handle_new_user` trigger, `user_roles` table
- Storage buckets (avatars, covers, photos, videos, thumbnails, exports, temporary) with signed-URL access only
- Design system in `src/styles.css` (semantic tokens, event-themable primary/accent via CSS vars), typography, motion tokens honoring `prefers-reduced-motion`
- Admin auth routes: `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password` (email+password + Google via Lovable broker)
- `_authenticated` layout gate for `/dashboard/*`
- Marketing landing `/`

## Phase 2 — Guest join + custom camera
- Edge/server fns: `join-event` (bcrypt password check, issue HMAC guest token), `create-upload-url`, `finalize-upload`
- Guest session (localStorage token + `x-guest-token` header + `guest_sessions` row)
- `/join/:slug` password + name entry flow with shake-on-error, avatar picker
- `/event/:slug/camera`: full custom `getUserMedia` UI — shutter, flip, flash/torch, filter carousel (CSS-filter + single-pass WebGL bake at capture), timer, grid, zoom, tap-to-focus, burst, mirror-selfie, permission fallbacks
- 20 filter presets as config objects; capture baked via offscreen canvas
- Client-side WebP compression (≤2560px), background upload tray

## Phase 3 — Gallery + realtime
- `/event/:slug/gallery` masonry with `useInfiniteQuery` (page 30), LQIP → thumb → full
- `/event/:slug/photo/:id` fullscreen viewer: swipe, pinch-zoom, comments (realtime), likes (optimistic), download, share, EXIF
- Realtime channel `event:{id}` for photos/likes/comments/moderation
- Selection mode + bulk actions
- `/event/:slug/slideshow` TV-optimized Ken Burns autoplay
- `/event/:slug/albums` + `/search` with feature-flagged AI chips

## Phase 4 — Admin dashboard
- `/dashboard` event list, `/dashboard/events/new` multi-step wizard with autosave + QR generation
- Per-event: `overview` (Recharts, storage meter, leaderboards), `settings`, `moderation` queue, `guests`, `albums`, `exports`
- `/dashboard/account`, `/dashboard/notifications` with realtime bell

## Phase 5 — Background jobs, notifications, exports, PWA
- Scheduled fns: `sweep-temporary-bucket`, `expire-events`, `compute-daily-analytics`, `purge-deleted-events`, auto-album bucketing
- Export ZIP job with Realtime progress + 24h signed download
- Notifications table + email stub (Resend) + in-app center
- Server-side watermark compositing on thumbnail/export
- `vite-plugin-pwa` install + offline IndexedDB upload queue with reconnect flush
- Rate limiting on Edge Functions
- AI seams: `photos.ai_metadata`, `duplicate_of_photo_id`, `quality_score`, no-op `ai-process-photo` fn wired into finalize

## Technical details
- **Server logic**: `createServerFn` for app-internal (join, upload URL, finalize, moderate, like, comment, export request); server routes under `/api/public/*` for webhooks/cron only.
- **Guest identity**: HMAC token with `SESSION_SECRET` (generated via `generate_secret`), verified per-request in a server-fn middleware that sets `request.guest_id` for RLS via `SET LOCAL app.guest_id`.
- **RLS**: default-deny; owner-scoped admin policies; guest policies via `current_guest_id()` reading the local setting.
- **Storage**: never public. All access via `createSignedUrl` (1h photos, 24h exports).
- **Data**: typed hooks (`useEvent`, `usePhotos`, `useGuestSession` …) — no `supabase.from()` in components. Loader + `useSuspenseQuery` pattern.
- **PWA**: guarded registration (no SW in Lovable preview / iframe / dev), `NetworkFirst` HTML, `CacheFirst` hashed assets.

## Confirm to proceed
Reply **"Start Phase 1"** and I'll ship Phase 1 end-to-end (schema + auth + design + landing). Or tell me to reorder, skip, or expand a phase.
