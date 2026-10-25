-- Guests cannot read public.events (owner-only policy), so any policy that
-- checked event/photo state through an RLS-filtered subquery silently denied
-- everything. These SECURITY DEFINER helpers do those lookups instead.
CREATE OR REPLACE FUNCTION public.event_is_live(_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id AND e.deleted_at IS NULL AND e.status <> 'archived'
  )
$$;

CREATE OR REPLACE FUNCTION public.photo_event_id(_photo_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.event_id FROM public.photos p WHERE p.id = _photo_id
$$;

CREATE OR REPLACE FUNCTION public.photo_is_visible(_photo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.photos p
    WHERE p.id = _photo_id AND p.deleted_at IS NULL AND p.status = 'approved'
      AND public.event_is_live(p.event_id)
  )
$$;

REVOKE ALL ON FUNCTION public.event_is_live(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.photo_event_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.photo_is_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_is_live(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.photo_event_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.photo_is_visible(uuid) TO authenticated;

-- photos: only guests of the event (or the host) may read its approved photos.
DROP POLICY IF EXISTS "photos public read active events" ON public.photos;
CREATE POLICY "photos guest read" ON public.photos FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND status = 'approved'
  AND public.event_is_live(event_id)
  AND public.is_event_guest(event_id)
);

-- guests: visible to fellow guests of the same event.
DROP POLICY IF EXISTS "guests public read active events" ON public.guests;
CREATE POLICY "guests co-guest read" ON public.guests FOR SELECT TO authenticated
USING (public.event_is_live(event_id) AND public.is_event_guest(event_id));

-- likes
DROP POLICY IF EXISTS "likes public read active events" ON public.likes;
CREATE POLICY "likes guest read" ON public.likes FOR SELECT TO authenticated
USING (
  public.photo_is_visible(photo_id)
  AND public.is_event_guest(public.photo_event_id(photo_id))
);
DROP POLICY IF EXISTS "likes guest insert" ON public.likes;
CREATE POLICY "likes guest insert" ON public.likes FOR INSERT TO authenticated
WITH CHECK (
  guest_id = public.current_event_guest_id(public.photo_event_id(photo_id))
  AND public.photo_is_visible(photo_id)
);
DROP POLICY IF EXISTS "likes guest delete" ON public.likes;
CREATE POLICY "likes guest delete" ON public.likes FOR DELETE TO authenticated
USING (guest_id = public.current_event_guest_id(public.photo_event_id(photo_id)));

-- comments
DROP POLICY IF EXISTS "comments public read active events" ON public.comments;
CREATE POLICY "comments guest read" ON public.comments FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND public.photo_is_visible(photo_id)
  AND public.is_event_guest(public.photo_event_id(photo_id))
);
DROP POLICY IF EXISTS "comments guest insert" ON public.comments;
CREATE POLICY "comments guest insert" ON public.comments FOR INSERT TO authenticated
WITH CHECK (
  guest_id = public.current_event_guest_id(public.photo_event_id(photo_id))
  AND public.event_comments_open(public.photo_event_id(photo_id))
  AND public.photo_is_visible(photo_id)
);

DELETE FROM public.photos WHERE storage_path IN ('p.jpg', 'q.jpg') OR storage_path LIKE '%/s.jpg';
DELETE FROM public.guests WHERE name IN ('Curl Guest', 'Curl2', 'Curl3', 'Curl4', 'Upload Tester', 'Playwright Guest');