# Event Moments

Lovable Build Prompt — alivecap: Live Event Camera & Shared Gallery Platform

Build a production-ready, publicly launchable web application called alivecap— a mobile-first Progressive Web App where event guests join a private event via QR code, take photos through a custom in-app camera with live filters, and see them appear instantly in a shared, realtime gallery. No guest account is ever required. The product must feel as polished as Linear, Stripe, or Apple's native camera app, and must be architected to support thousands of concurrent guests across many simultaneous live events.

Do not build an MVP. Build this as if it will be sold as a SaaS product to real customers (wedding photographers, event planners, corporates) starting week one. Make every reasonable engineering decision needed to fill gaps — do not leave TODOs or placeholders in the generated code except in the explicitly-marked "AI Features (Future-Ready)" section.

1. Tech Stack (mandatory)

React 18 + TypeScript + Vite

Tailwind CSS + shadcn/ui (Radix primitives)

Framer Motion for all transitions/micro-interactions

React Query (TanStack Query) for all server state — no raw useEffect fetching

React Hook Form + Zod for every form and every runtime validation boundary

Supabase: Postgres, Auth, Storage, Realtime, Edge Functions

Lucide Icons

PWA plugin (vite-plugin-pwa) with offline caching and installability

react-easy-crop or browser-native Canvas/WebGL for camera filter rendering (GPU-accelerated via CSS/WebGL filters, not per-frame CPU pixel manipulation)

2. Information Architecture — Full Page List

Public / Guest-facing

/ — Marketing landing page (product pitch, pricing teaser, CTA to create event)

/join/:eventSlug — QR landing → password gate → name entry → join

/event/:eventSlug/camera — Full-screen camera capture experience

/event/:eventSlug/gallery — Shared masonry gallery

/event/:eventSlug/photo/:photoId — Fullscreen photo viewer (comments, likes, download, share)

/event/:eventSlug/slideshow — TV/kiosk fullscreen autoplay mode

/event/:eventSlug/albums — Album browser

/event/:eventSlug/search — Search & filter view

/event-expired / /event-locked / /event-not-found — Terminal states

Admin-facing (behind Supabase Auth)

/auth/sign-in, /auth/sign-up, /auth/forgot-password

/dashboard — List of all events owned by admin

/dashboard/events/new — Event creation wizard

/dashboard/events/:eventId/overview — Stats, activity feed, storage meter

/dashboard/events/:eventId/settings — All event configuration (permissions, theme, expiry, watermark)

/dashboard/events/:eventId/moderation — Gallery moderation queue

/dashboard/events/:eventId/guests — Guest list, block/unblock

/dashboard/events/:eventId/albums — Album management

/dashboard/events/:eventId/exports — Bulk ZIP export jobs

/dashboard/account — Admin profile & billing (Stripe-ready, stubbed)

/dashboard/notifications — Notification center

3. Guest Flow (must feel like magic — under 15 seconds to first photo)

Guest scans QR → lands on /join/:eventSlug.

If events.password_hash is set, show a single large password field with shake-animation on error.

Name entry screen: single text input, optional avatar (camera/upload/emoji picker), large "Join Event" button. Autofocus, autofill from localStorage if returning on same device.

On join, call join_event Edge Function → creates a row in guests and a signed, httpOnly-equivalent guest session token stored in localStorage + a guest_sessions row (expires with event or after 24h of inactivity, whichever is sooner).

Redirect straight into /event/:eventSlug/camera — camera permission prompt appears immediately with a friendly pre-permission explainer card ("alivecap needs your camera to take photos for the shared gallery").

After capture, photo enters an optimistic "uploading" state in a persistent bottom tray, then uploads in the background while the guest keeps shooting.

A floating "View Gallery" pill (with live-updating photo count) is always reachable via bottom tab bar: Camera | Gallery | Albums | Search.

Guests never see a login screen, never see raw Supabase errors, and are never blocked from taking more photos while one is uploading.

4. Camera Module — Detailed Spec

Build a fully custom camera UI on top of getUserMedia / MediaDevices, not the OS default file-picker camera.

Core controls (bottom bar, thumb-reachable):

Shutter button (large, center, haptic-style press animation)

Front/rear camera flip (facingMode toggle)

Flash: off / on / auto (torch API where supported, screen-flash fallback on front camera)

Filter carousel (horizontally swipeable strip above shutter, live WebGL/CSS-filter preview)

Mode switch: Photo / Burst / Video (if events.allow_videos)

Secondary controls (top bar):

Grid overlay toggle (rule-of-thirds)

Timer (off/3s/10s) with animated countdown overlay

HDR toggle (simulated via exposure blending where native HDR unsupported)

Zoom slider (pinch-to-zoom + on-screen slider, mapped to applyConstraints({advanced:[{zoom}]}) with graceful digital-zoom fallback)

Close button → returns to gallery

Interaction details:

Tap-to-focus: tap anywhere on viewfinder shows animated focus ring, calls applyConstraints on supported devices

Burst mode: hold shutter → captures at ~6fps for up to 3s, shows a filmstrip picker to select best shots before upload

Mirror selfie preview on front camera (mirrored preview, non-mirrored saved output, matching iOS convention)

Photo preview screen after capture: Retake / Add Filter / Save & Upload, swipe-down to dismiss

Permission denied → full-screen friendly error state with "Open Settings" instructions per browser (Safari vs Chrome vs Android WebView), and a "Continue without camera — upload from gallery instead" fallback button

Unsupported browser (no getUserMedia) → same fallback, auto-detected via feature check on mount

Filters (GPU-efficient — implemented as composited CSS filter/backdrop-filter stacks and/or single-pass WebGL shaders, never full-frame JS pixel loops): Original, Vintage, Film, Golden Hour, Wedding Glow, Portrait, Matte, Black & White, Retro, Disposable Camera, Polaroid, Warm, Cool, Cinematic, Soft, Bright, Grain, Neon, Festival, VHS. Each filter is a config object ({brightness, contrast, saturate, sepia, hueRotate, grainOverlayOpacity, vignette}) applied live to the <video> preview and baked into the final image via an offscreen <canvas> at capture time.

5. Gallery Module

Pinterest-style masonry (CSS columns or react-masonry-css), responsive column count (2 on mobile, 3–4 tablet, 5–6 desktop/TV)

Infinite scroll via React Query useInfiniteQuery, page size 30, IntersectionObserver trigger

Each card: blurred low-res placeholder (LQIP) → progressive load of thumbnail → full image on open

Card overlay on hover/tap: uploader name + avatar, relative timestamp, like count/button, comment count, download icon, more-menu (share, report, admin: pin/hide/delete)

Fullscreen viewer: swipe left/right between photos, pinch-zoom, comment thread (realtime), like with optimistic double-tap-to-like, download (original vs compressed choice), share sheet (native Web Share API with clipboard fallback), EXIF panel (collapsed by default) if events.show_exif

Selection mode: long-press to multi-select → bulk download (ZIP), bulk delete (admin), bulk add-to-album

Albums: Automatic albums generated by a scheduled Edge Function bucketing photos by capture-time windows (Morning/Reception/Dinner/Dance, configurable per event type) plus tag-based auto-albums (Selfies via simple heuristic, Group Photos, Videos, Favorites = most-liked). Admins can create custom manual albums and drag photos into them.

Live Feed & Slideshow: Gallery subscribes to a Supabase Realtime channel scoped to event_id; new photos inserts animate into the top of the grid with a subtle scale+fade. Slideshow mode (/event/:eventSlug/slideshow) is a fullscreen, TV-optimized, keyboard/remote-navigable autoplay carousel (Ken Burns pan/zoom transition, 6s/photo default, configurable), auto-subscribes to new photos and inserts them into the rotation without interrupting the current photo.

6. Admin Dashboard

Event creation wizard (multi-step, autosaves draft): Basics (name, description, date, venue, cover image upload) → Access (password toggle, guest limit, expiry date/time) → Permissions (allow downloads/uploads/videos/comments/likes) → Branding (theme color, watermark upload + opacity/position, font) → Review & Generate (QR code + shareable invite link, copy/download QR as PNG/SVG).

Overview tab: live counters (guests, photos, videos, downloads), storage used vs. plan limit (progress bar with warning states at 80%/95%), most active guest leaderboard, recent uploads feed, most-liked photos, device breakdown (mobile/desktop/OS via UA parsing), event timeline chart (photos-per-hour, Recharts).

Moderation queue: grid of all photos with quick actions — Approve, Hide, Delete, Feature, Pin to top, Report reason log, Block uploading guest. Bulk actions toolbar. Filter by status (pending/approved/hidden/reported).

Guests tab: table of joined guests (name, avatar, join time, photo count, device), block/unblock toggle, remove guest + their photos.

Settings tab: every field from event creation remains editable, plus lifecycle controls: Lock Event (stops new uploads, gallery stays viewable), Archive Event (read-only, excluded from active dashboard list), Delete Event (soft-delete with 30-day recovery, then hard delete + storage purge via scheduled Edge Function).

Exports tab: request a ZIP export (all photos / album / date range), job runs in an Edge Function queue, progress shown via Realtime, completed export produces a signed download link in the exports bucket with a 24h expiry, and triggers a "Download Complete" notification.

7. Notifications

In-app notification center + optional email (via Supabase Edge Function + Resend/SendGrid stub) for: Guest Joined, New Photo Uploaded (throttled/batched, not per-photo spam), Event Locked, Storage Almost Full (80%/95%), Export/Download Complete, Photo Reported. Stored in a notifications table, delivered live via Realtime to the admin dashboard bell icon with unread badge.

8. Database Schema (PostgreSQL via Supabase)

Design fully normalized, with UUID primary keys (gen_random_uuid()), created_at/updated_at timestamps (via trigger), and soft-delete (deleted_at) where lifecycle matters.

-- Admin users (Supabase Auth mirror)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique not null,
  avatar_url text,
  plan text not null default 'free', -- free | pro | business
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  slug text unique not null,
  name text not null,
  description text,
  venue text,
  event_date date,
  cover_image_url text,
  password_hash text,               -- null = no password
  status text not null default 'draft', -- draft | live | locked | archived | deleted | expired
  expires_at timestamptz,
  guest_limit int,
  storage_limit_mb int not null default 5120,
  storage_used_mb numeric not null default 0,
  allow_downloads boolean not null default true,
  allow_uploads boolean not null default true,
  allow_videos boolean not null default true,
  allow_comments boolean not null default true,
  allow_likes boolean not null default true,
  show_exif boolean not null default false,
  theme jsonb not null default '{}', -- {primaryColor, accentColor, font}
  watermark_url text,
  watermark_opacity numeric default 0.5,
  visibility text not null default 'private', -- private | unlisted
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  avatar_url text,
  device_info jsonb,
  is_blocked boolean not null default false,
  joined_at timestamptz not null default now()
);

create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  type text not null default 'manual', -- manual | auto
  cover_photo_id uuid,
  created_at timestamptz not null default now()
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  album_id uuid references public.albums(id) on delete set null,
  storage_path text not null,
  thumbnail_path text,
  media_type text not null default 'photo', -- photo | video
  filter_applied text,
  width int,
  height int,
  size_bytes bigint,
  exif jsonb,
  status text not null default 'approved', -- pending | approved | hidden | reported
  is_pinned boolean not null default false,
  is_featured boolean not null default false,
  taken_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.likes (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (photo_id, guest_id)
);

create table public.downloads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete cascade,
  guest_id uuid references public.guests(id),
  download_type text not null default 'single', -- single | zip
  created_at timestamptz not null default now()
);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  requested_by uuid references public.users(id),
  scope jsonb not null, -- {type: 'all'|'album'|'range', ...}
  status text not null default 'queued', -- queued | processing | complete | failed
  file_path text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  qr_code_url text,
  invite_link text not null,
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  actor_type text not null, -- admin | guest | system
  actor_id uuid,
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  reported_by uuid references public.guests(id),
  reason text,
  status text not null default 'open', -- open | reviewed | dismissed
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  type text not null,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.analytics_daily (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  day date not null,
  photos_count int not null default 0,
  guests_count int not null default 0,
  downloads_count int not null default 0,
  unique (event_id, day)
);


Add updated_at triggers on every mutable table and indexes on all foreign keys plus photos(event_id, created_at desc), events(slug), guests(event_id).

9. Authentication & Authorization

Admins: Supabase Auth (email/password + Google OAuth). Every admin row auto-creates a public.users row via a handle_new_user trigger on auth.users.

Guests: never use Supabase Auth. A guest "session" is a signed token (HMAC, Edge Function-issued) stored client-side and sent as a custom header (x-guest-token) on every request. An Edge Function validates the token, resolves guest_id/event_id, and this identity is what RLS policies check against via a current_guest_id() Postgres function reading a request-scoped setting set by the Edge Function using SET LOCAL.

RLS is mandatory on every table. Representative policies:

events: owner can select/update/delete where owner_id = auth.uid(); anyone can select a row where status = 'live' and visibility allows it (for the public join flow, via a restricted public view that excludes password_hash).

photos: insert allowed only if the requesting guest belongs to a live, non-locked event and allow_uploads = true; select allowed to any guest/admin belonging to that event; update/delete restricted to the photo's own guest (within a short edit window) or the event's admin.

comments/likes: insert only if allow_comments/allow_likes is true on the parent event and the guest belongs to that event.

guests: a guest can only read their own row plus the roster of their own event (for "guest joined" toasts); admins can read/update/delete guests of events they own.

All password checks happen server-side in an Edge Function (bcrypt/argon2 hash comparison) — the hash is never sent to the client.

Signed, time-limited URLs (Supabase Storage signed URLs, default 1h) for all photo/video access; storage buckets are not public.

10. Supabase Storage Buckets

Bucket Public Purpose Notes avatars No (signed) Guest/admin avatars 2MB limit, image only covers No (signed) Event cover images 8MB limit photos No (signed) Original uploaded photos Virus-scan hook, 25MB limit videos No (signed) Uploaded video clips 200MB limit, transcode via Edge Function thumbnails No (signed) Auto-generated thumbnails/LQIP Generated on upload via Edge Function exports No (signed, 24h expiry) ZIP export bundles Auto-purged after expiry temporary No (signed, 1h expiry) In-progress/offline-queued uploads Swept by scheduled cleanup job

Upload flow: client requests a signed upload URL from an Edge Function (create-upload-url) which validates event status, storage quota, and file constraints before issuing the URL — never allow direct anonymous writes to a bucket.

11. API / Edge Functions

POST /join-event — validate password, create guest + session, return signed token

POST /create-upload-url — quota + permission check, returns signed PUT URL + storage path

POST /finalize-upload — creates photos row, triggers thumbnail generation, updates storage_used_mb, broadcasts Realtime event

POST /toggle-like, POST /add-comment — permission-checked mutations

POST /generate-export — enqueues export job

GET /export-status/:id — polled or Realtime-subscribed

POST /moderate-photo — admin-only, requires Supabase Auth JWT

POST /rotate-invite-link — regenerate QR/invite for security

Scheduled functions: sweep-temporary-bucket, expire-events, compute-daily-analytics, purge-deleted-events

12. Realtime

Use Supabase Realtime Postgres Changes + Broadcast, channel-per-event (event:{eventId}), for: new photo inserts, like/comment counts, guest-joined toasts, moderation status changes (hide/delete propagate instantly to all viewers), storage-limit warnings to admin dashboard, slideshow photo insertion, export job progress.

13. Security

Password-protected events (server-side hash verification only)

All storage access via short-lived signed URLs, never public buckets

RLS on every table, default-deny

Rate limiting on join/upload/comment/like Edge Functions (per-IP and per-guest-session, sliding window)

Image MIME + magic-byte validation server-side before accepting upload finalization

Malware-scan architecture: upload lands in temporary bucket first, an Edge Function hook (stubbed for ClamAV/3rd-party scanning API) must approve before promotion to photos bucket

Strip EXIF GPS data by default before public display (configurable per event via show_exif)

CSRF-safe design (token-based, no cookies for guest identity)

Content moderation queue + report pipeline to catch abuse quickly

14. Performance

Client-side image compression (WebP, max long-edge 2560px) before upload, original preserved separately if plan allows

Auto thumbnail + blurhash/LQIP generation on upload

Lazy-loaded, responsive <img srcset> throughout the gallery

Infinite scroll with windowing for very large galleries (react-virtual for >500 photos)

React Query caching + stale-while-revalidate, optimistic updates for likes/comments/uploads

CDN-fronted Storage (Supabase's built-in CDN)

Background/queued uploads so capturing is never blocked by network speed

15. Accessibility

Full keyboard navigation for admin dashboard and gallery; ARIA labels on all icon-only buttons (shutter, flip camera, like, download, etc.); visible focus rings meeting WCAG contrast; screen-reader announcements for "photo uploaded," "new photo available," toast messages; minimum 44×44px touch targets throughout the camera and gallery UI; high-contrast mode support via a theme toggle; reduced-motion variant of all Framer Motion animations respecting prefers-reduced-motion.

16. Responsive Design

Mobile-first (375px baseline) up through tablet, laptop, desktop, and large TV displays for slideshow mode (test at 1920×1080 and 3840×2160). Camera view is always full-viewport on mobile; on desktop/tablet it centers in a phone-frame-style card with the same functional camera underneath (using the device's webcam).

17. Animations & States

Micro-interactions: shutter press bounce, like double-tap heart burst, filter carousel snap, tab-bar active-state morph, skeleton shimmer while loading

Loading states: skeleton cards for gallery grid, shimmer for stats, spinner overlays for camera init

Empty states: "No photos yet — be the first to capture a memory!" with illustration and CTA button, for gallery/albums/search-no-results

Error states: camera denied, upload failed (with retry button), storage full, wrong password (shake + inline message), event expired/locked (dedicated full-page state), network lost (persistent banner, auto-retry), image too large, unsupported browser, generic permission denied — every error state has an icon, headline, short explanation, and a recovery action

Toasts for guest-joined, photo-uploaded, like-received (admin), using shadcn/ui sonner

18. Offline Support (PWA)

Service worker caches the app shell and last-viewed gallery. If a guest captures a photo offline, it's stored in IndexedDB with status queued, shown in the upload tray with an "offline — will upload when connected" indicator. A connectivity listener automatically flushes the queue via /create-upload-url + /finalize-upload on reconnect, in original capture order, with conflict handling (skip if the guest session has since expired, prompting a quiet re-join).

19. AI Features (Future-Ready — build the seams, not the models)

Do not integrate real AI models. Build the architecture so they can be dropped in later:

photos.ai_metadata jsonb column reserved for tags/objects/face-clusters

A POST /ai-process-photo Edge Function stub that currently no-ops but is wired into the finalize-upload pipeline as a fire-and-forget call

Search UI already includes filter chips for "AI Objects" and "Face Search" that are feature-flagged off (event.theme.aiFeaturesEnabled) until a model is connected

Reserve duplicate_of_photo_id and quality_score columns on photos for future Best-Shot/Duplicate-Detection features

Reserve an albums.type = 'ai_auto' value for future AI-organized albums

20. Branding & Theming

Every event supports a custom primary color, accent color, logo, cover image, font (default Inter, selectable), and an optional watermark image with adjustable opacity/position (corner picker) applied server-side at thumbnail/export time via an Edge Function (sharp/Canvas compositing), never client-only, so it's tamper-resistant.

21. Non-Negotiable Implementation Guidance for Lovable

Use React Query for all reads/writes to Supabase; no direct supabase.from() calls inside components — wrap in typed hooks (useEvent, usePhotos, useGuestSession, etc.)

Generate full TypeScript types from the schema above (or hand-written types matching it exactly) and share them across guest and admin surfaces

Componentize aggressively: CameraView, FilterCarousel, ShutterButton, GalleryGrid, PhotoCard, PhotoViewer, AlbumGrid, AdminStatCard, ModerationCard, EventWizardStep, etc. — no 500-line page files

Every mutation must have optimistic UI + rollback-on-error + toast feedback

Every list view must have loading, empty, and error states implemented, not just the happy path

Build with thousands-of-concurrent-guests-per-event in mind: paginate everything, never fetch unbounded lists, debounce realtime-triggered refetches

Ship as an installable PWA from day one

Build this now as a single, coherent, production-grade codebase following every specification above.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://alivecap.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/deeb4f58-57dc-4226-9131-5aeaa0ca5471).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Environment variables & production deployment (Vercel)

All Supabase credentials come from environment variables — nothing is hardcoded
in source. See `.env.example` for the full list (no real values).

Public, browser-visible (Vite inlines these at build time):

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL used by the browser client |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable (new-format) API key; RLS applies |
| `VITE_SUPABASE_PROJECT_ID` | Optional, display/links only |

Server-only (SSR + server functions, never shipped to the browser):

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Server mirror of the project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Used by the auth middleware to act as the signed-in user (RLS applies) |
| _(none)_ | No service-role key is needed: guests use an anonymous Supabase session and all access is enforced by Row Level Security |
| `SUPABASE_PROJECT_ID` | Optional |

Rules enforced in the codebase:

- The browser only ever reads `import.meta.env.VITE_*`; `process.env.*` is read
  exclusively inside server function handlers / `*.server.ts` modules.
- The service role key is never referenced from client-reachable code and is
  never prefixed with `VITE_`.
- If a public variable is missing, the app renders a clear configuration screen
  listing the missing variable *names* only — values are never printed, logged,
  or surfaced in the UI.
- Legacy `VITE_SUPABASE_ANON_KEY` is not used anywhere; the publishable key is
  the single client credential.

Vercel setup: add every variable above (Production + Preview), keep the default
build command (`vite build`) and install command. The build detects `VERCEL` and
emits Nitro's Vercel Build Output, so no `vercel.json` is required.
