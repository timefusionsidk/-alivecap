
-- ============ Extensions ============
create extension if not exists pgcrypto;

-- ============ Enums ============
create type public.app_role as enum ('admin');

-- ============ Helpers ============
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- Guest identity, set per-request by server functions via SET LOCAL app.guest_id = '<uuid>'
create or replace function public.current_guest_id()
returns uuid language plpgsql stable set search_path = public as $$
declare v text;
begin
  begin v := current_setting('app.guest_id', true); exception when others then v := null; end;
  if v is null or v = '' then return null; end if;
  return v::uuid;
end $$;

-- ============ users (admin mirror) ============
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique not null,
  avatar_url text,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.users to authenticated;
grant all on public.users to service_role;
alter table public.users enable row level security;
create policy "users self read" on public.users for select to authenticated using (id = auth.uid());
create policy "users self update" on public.users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create trigger t_users_updated before update on public.users for each row execute function public.update_updated_at_column();

-- auth.users -> public.users bridge
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ user_roles ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "roles self read" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ============ events ============
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  slug text unique not null,
  name text not null,
  description text,
  venue text,
  event_date date,
  cover_image_url text,
  password_hash text,
  status text not null default 'draft',
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
  theme jsonb not null default '{}'::jsonb,
  watermark_url text,
  watermark_opacity numeric default 0.5,
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index events_owner_idx on public.events(owner_id);
create index events_slug_idx on public.events(slug);
grant select, insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;
create policy "events owner all" on public.events for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create trigger t_events_updated before update on public.events for each row execute function public.update_updated_at_column();

-- ============ guests ============
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  avatar_url text,
  device_info jsonb,
  is_blocked boolean not null default false,
  joined_at timestamptz not null default now()
);
create index guests_event_idx on public.guests(event_id);
grant select, insert, update, delete on public.guests to authenticated;
grant all on public.guests to service_role;
alter table public.guests enable row level security;
create policy "guests admin manage" on public.guests for all to authenticated
  using (exists(select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()))
  with check (exists(select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

-- ============ guest_sessions ============
create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index guest_sessions_guest_idx on public.guest_sessions(guest_id);
grant all on public.guest_sessions to service_role;
alter table public.guest_sessions enable row level security;

-- ============ albums ============
create table public.albums (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  type text not null default 'manual',
  cover_photo_id uuid,
  created_at timestamptz not null default now()
);
create index albums_event_idx on public.albums(event_id);
grant select, insert, update, delete on public.albums to authenticated;
grant all on public.albums to service_role;
alter table public.albums enable row level security;
create policy "albums admin" on public.albums for all to authenticated
  using (exists(select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()))
  with check (exists(select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

-- ============ photos ============
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  album_id uuid references public.albums(id) on delete set null,
  storage_path text not null,
  thumbnail_path text,
  media_type text not null default 'photo',
  filter_applied text,
  width int,
  height int,
  size_bytes bigint,
  exif jsonb,
  status text not null default 'approved',
  is_pinned boolean not null default false,
  is_featured boolean not null default false,
  ai_metadata jsonb,
  duplicate_of_photo_id uuid,
  quality_score numeric,
  taken_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index photos_event_created_idx on public.photos(event_id, created_at desc);
create index photos_album_idx on public.photos(album_id);
grant select, insert, update, delete on public.photos to authenticated;
grant all on public.photos to service_role;
alter table public.photos enable row level security;
create policy "photos admin" on public.photos for all to authenticated
  using (exists(select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()))
  with check (exists(select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

-- ============ comments ============
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index comments_photo_idx on public.comments(photo_id);
grant select, insert, update, delete on public.comments to authenticated;
grant all on public.comments to service_role;
alter table public.comments enable row level security;
create policy "comments admin" on public.comments for all to authenticated
  using (exists(
    select 1 from public.photos p join public.events e on e.id = p.event_id
    where p.id = photo_id and e.owner_id = auth.uid()))
  with check (exists(
    select 1 from public.photos p join public.events e on e.id = p.event_id
    where p.id = photo_id and e.owner_id = auth.uid()));

-- ============ likes ============
create table public.likes (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (photo_id, guest_id)
);
create index likes_photo_idx on public.likes(photo_id);
grant select, insert, update, delete on public.likes to authenticated;
grant all on public.likes to service_role;
alter table public.likes enable row level security;
create policy "likes admin read" on public.likes for select to authenticated
  using (exists(
    select 1 from public.photos p join public.events e on e.id = p.event_id
    where p.id = photo_id and e.owner_id = auth.uid()));

-- ============ downloads ============
create table public.downloads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete cascade,
  guest_id uuid references public.guests(id),
  download_type text not null default 'single',
  created_at timestamptz not null default now()
);
create index downloads_event_idx on public.downloads(event_id);
grant select on public.downloads to authenticated;
grant all on public.downloads to service_role;
alter table public.downloads enable row level security;
create policy "downloads admin read" on public.downloads for select to authenticated
  using (exists(select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

-- ============ exports ============
create table public.exports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  requested_by uuid references public.users(id),
  scope jsonb not null,
  status text not null default 'queued',
  file_path text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index exports_event_idx on public.exports(event_id);
grant select, insert, update on public.exports to authenticated;
grant all on public.exports to service_role;
alter table public.exports enable row level security;
create policy "exports admin" on public.exports for all to authenticated
  using (exists(select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()))
  with check (exists(select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

-- ============ invitations ============
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  qr_code_url text,
  invite_link text not null,
  created_at timestamptz not null default now()
);
create index invitations_event_idx on public.invitations(event_id);
grant select, insert, update, delete on public.invitations to authenticated;
grant all on public.invitations to service_role;
alter table public.invitations enable row level security;
create policy "invitations admin" on public.invitations for all to authenticated
  using (exists(select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()))
  with check (exists(select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

-- ============ activity_logs ============
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  actor_type text not null,
  actor_id uuid,
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index activity_logs_event_idx on public.activity_logs(event_id);
grant select on public.activity_logs to authenticated;
grant all on public.activity_logs to service_role;
alter table public.activity_logs enable row level security;
create policy "activity admin read" on public.activity_logs for select to authenticated
  using (exists(select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));

-- ============ reports ============
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  reported_by uuid references public.guests(id),
  reason text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
create index reports_photo_idx on public.reports(photo_id);
grant select, update on public.reports to authenticated;
grant all on public.reports to service_role;
alter table public.reports enable row level security;
create policy "reports admin" on public.reports for all to authenticated
  using (exists(
    select 1 from public.photos p join public.events e on e.id = p.event_id
    where p.id = photo_id and e.owner_id = auth.uid()))
  with check (exists(
    select 1 from public.photos p join public.events e on e.id = p.event_id
    where p.id = photo_id and e.owner_id = auth.uid()));

-- ============ notifications ============
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  type text not null,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "notif self" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notif self update" on public.notifications for update to authenticated using (user_id = auth.uid());

-- ============ analytics_daily ============
create table public.analytics_daily (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  day date not null,
  photos_count int not null default 0,
  guests_count int not null default 0,
  downloads_count int not null default 0,
  unique (event_id, day)
);
create index analytics_event_idx on public.analytics_daily(event_id);
grant select on public.analytics_daily to authenticated;
grant all on public.analytics_daily to service_role;
alter table public.analytics_daily enable row level security;
create policy "analytics admin" on public.analytics_daily for select to authenticated
  using (exists(select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
