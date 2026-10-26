-- New-project safe variant: do not delete any events, guests, photos, or user data.
-- Existing deployments should review orphan records separately before applying the NOT NULL constraint.
-- 2. Every event must belong to a host account.
alter table public.events alter column owner_id set not null;

-- 3. One guest row per device per event: refreshes / double taps reuse the same guest.
create unique index if not exists guests_event_device_uniq
  on public.guests (event_id, (device_info->>'device_id'))
  where device_info->>'device_id' is not null;
