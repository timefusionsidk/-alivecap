-- Access-policy correction only: no table/column or provider changes.
-- The old per-bucket "deny" policies were permissive and ORed together:
-- every bucket was unintentionally allowed by the policies for other buckets.
DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['avatars','covers','photos','videos','thumbnails','exports','temporary']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'deny_client_' || b);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "event media read" ON storage.objects;
CREATE POLICY "event media read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('photos', 'thumbnails')
  AND EXISTS (
    SELECT 1 FROM public.photos p
    WHERE p.event_id = public.storage_event_id(name)
      AND p.status = 'approved' AND p.deleted_at IS NULL
      AND ((bucket_id = 'photos' AND p.storage_path = name)
        OR (bucket_id = 'thumbnails' AND p.thumbnail_path = name))
      AND public.is_event_guest(p.event_id)
      AND public.event_is_live(p.event_id)
  )
);
-- The existing event media host manage policy remains intact.
-- Public covers are only readable when assigned to an accessible event.
CREATE POLICY "event guest cover read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'covers'
  AND public.is_event_guest(public.storage_event_id(name))
  AND public.event_is_live(public.storage_event_id(name))
);
