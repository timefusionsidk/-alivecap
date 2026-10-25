
-- Realtime for gallery activity
ALTER TABLE public.photos REPLICA IDENTITY FULL;
ALTER TABLE public.likes REPLICA IDENTITY FULL;
ALTER TABLE public.comments REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'photos'
  ) THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.photos'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'likes'
  ) THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.likes'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'comments'
  ) THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.comments'; END IF;
END $$;

-- Allow public read for active events so guests can subscribe via realtime with the anon key.
GRANT SELECT ON public.photos TO anon;
GRANT SELECT ON public.likes TO anon;
GRANT SELECT ON public.comments TO anon;
GRANT SELECT ON public.events TO anon;

CREATE POLICY "photos public read active events"
ON public.photos FOR SELECT
TO anon, authenticated
USING (
  deleted_at IS NULL
  AND status = 'approved'
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = photos.event_id
      AND e.deleted_at IS NULL
      AND e.status <> 'archived'
  )
);

CREATE POLICY "likes public read active events"
ON public.likes FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.photos p
    JOIN public.events e ON e.id = p.event_id
    WHERE p.id = likes.photo_id
      AND p.deleted_at IS NULL
      AND p.status = 'approved'
      AND e.deleted_at IS NULL
      AND e.status <> 'archived'
  )
);

CREATE POLICY "comments public read active events"
ON public.comments FOR SELECT
TO anon, authenticated
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.photos p
    JOIN public.events e ON e.id = p.event_id
    WHERE p.id = comments.photo_id
      AND p.deleted_at IS NULL
      AND p.status = 'approved'
      AND e.deleted_at IS NULL
      AND e.status <> 'archived'
  )
);

-- Guests table read for anon (only names/avatars for display in gallery)
GRANT SELECT ON public.guests TO anon;
CREATE POLICY "guests public read active events"
ON public.guests FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = guests.event_id
      AND e.deleted_at IS NULL
      AND e.status <> 'archived'
  )
);
