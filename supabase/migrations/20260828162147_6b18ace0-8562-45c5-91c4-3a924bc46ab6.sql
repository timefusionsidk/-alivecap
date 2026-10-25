CREATE INDEX IF NOT EXISTS photos_event_taken_idx ON public.photos (event_id, taken_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports (status);
CREATE INDEX IF NOT EXISTS downloads_event_created_idx ON public.downloads (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guests_event_joined_idx ON public.guests (event_id, joined_at DESC);

CREATE OR REPLACE FUNCTION public.host_event_stats()
RETURNS TABLE (event_id uuid, photo_count bigint, guest_count bigint, last_photo_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id,
         (SELECT count(*) FROM public.photos p WHERE p.event_id = e.id AND p.deleted_at IS NULL),
         (SELECT count(*) FROM public.guests g WHERE g.event_id = e.id),
         (SELECT max(p.taken_at) FROM public.photos p WHERE p.event_id = e.id AND p.deleted_at IS NULL)
  FROM public.events e
  WHERE e.owner_id = auth.uid() AND e.deleted_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.host_event_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.host_event_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.host_event_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.host_event_stats() TO service_role;