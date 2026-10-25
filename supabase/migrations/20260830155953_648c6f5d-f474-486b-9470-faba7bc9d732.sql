-- 1. Remove development-era ownerless events and all dependent rows.
create temporary table _orphan_events as
  select id from public.events where owner_id is null;

delete from public.likes where photo_id in (select p.id from public.photos p join _orphan_events o on o.id = p.event_id);
delete from public.comments where photo_id in (select p.id from public.photos p join _orphan_events o on o.id = p.event_id);
delete from public.reports where photo_id in (select p.id from public.photos p join _orphan_events o on o.id = p.event_id);
delete from public.downloads where event_id in (select id from _orphan_events);
delete from public.photos where event_id in (select id from _orphan_events);
delete from public.guest_sessions where guest_id in (select g.id from public.guests g join _orphan_events o on o.id = g.event_id);
delete from public.likes where guest_id in (select g.id from public.guests g join _orphan_events o on o.id = g.event_id);
delete from public.guests where event_id in (select id from _orphan_events);
delete from public.albums where event_id in (select id from _orphan_events);
delete from public.invitations where event_id in (select id from _orphan_events);
delete from public.exports where event_id in (select id from _orphan_events);
delete from public.analytics_daily where event_id in (select id from _orphan_events);
delete from public.activity_logs where event_id in (select id from _orphan_events);
delete from public.notifications where event_id in (select id from _orphan_events);
delete from public.events where id in (select id from _orphan_events);

-- 2. Every event must belong to a host account.
alter table public.events alter column owner_id set not null;

-- 3. One guest row per device per event: refreshes / double taps reuse the same guest.
create unique index if not exists guests_event_device_uniq
  on public.guests (event_id, (device_info->>'device_id'))
  where device_info->>'device_id' is not null;
