-- A3. One MB in existing UI/quota fields means 1 MiB (1,048,576 bytes).
-- These are bucket-level limits; the project's global Storage limit must be >=50 MiB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('photos', 'photos', false, 15728640, ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('thumbnails', 'thumbnails', false, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('videos', 'videos', false, 52428800, ARRAY['video/mp4','video/webm'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

ALTER TABLE public.events
  ADD CONSTRAINT events_storage_limit_nonnegative CHECK (storage_limit_mb >= 0),
  ADD CONSTRAINT events_storage_used_nonnegative CHECK (storage_used_mb >= 0),
  ADD CONSTRAINT events_guest_limit_nonnegative CHECK (guest_limit IS NULL OR guest_limit >= 0);

-- Persist the original + thumbnail total. Clients cannot choose or change this value.
ALTER TABLE public.photos ADD COLUMN quota_bytes bigint NOT NULL DEFAULT 0
  CHECK (quota_bytes >= 0);
-- Include hidden/rejected/soft-deleted photos: their objects still occupy storage.
UPDATE public.photos p SET quota_bytes =
  greatest(coalesce((SELECT (o.metadata->>'size')::bigint FROM storage.objects o
    WHERE o.bucket_id = CASE WHEN p.media_type = 'video' THEN 'videos' ELSE 'photos' END
      AND o.name = p.storage_path), p.size_bytes, 0), 0)
  + greatest(coalesce((SELECT (o.metadata->>'size')::bigint FROM storage.objects o
    WHERE o.bucket_id = 'thumbnails' AND o.name = p.thumbnail_path), 0), 0);
UPDATE public.events e SET storage_used_mb =
  coalesce((SELECT sum(p.quota_bytes) FROM public.photos p WHERE p.event_id = e.id), 0)::numeric / 1048576;
-- Fail rather than silently delete existing duplicate registrations.
CREATE UNIQUE INDEX photos_media_object_unique ON public.photos(media_type, storage_path);
CREATE UNIQUE INDEX photos_thumbnail_object_unique ON public.photos(thumbnail_path)
  WHERE thumbnail_path IS NOT NULL;

CREATE FUNCTION public.account_photo_storage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.events;
  meta jsonb;
  bucket text;
  actual_bytes bigint;
  thumb_bytes bigint := 0;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Atomic decrement also locks the event row. Cascading event deletion is safe.
    UPDATE public.events SET storage_used_mb = greatest(0,
      storage_used_mb - OLD.quota_bytes::numeric / 1048576) WHERE id = OLD.event_id;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.event_id, NEW.storage_path, NEW.thumbnail_path, NEW.media_type, NEW.size_bytes, NEW.quota_bytes)
      IS DISTINCT FROM
       ROW(OLD.event_id, OLD.storage_path, OLD.thumbnail_path, OLD.media_type, OLD.size_bytes, OLD.quota_bytes) THEN
      RAISE EXCEPTION 'Registered media identity and size are immutable' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Serialize registrations for this event; arithmetic must use the locked value.
  SELECT * INTO e FROM public.events WHERE id = NEW.event_id FOR UPDATE;
  IF NOT FOUND OR e.deleted_at IS NOT NULL OR e.status = 'archived'
     OR NOT e.allow_uploads OR (e.expires_at IS NOT NULL AND e.expires_at <= now()) THEN
    RAISE EXCEPTION 'Event uploads are closed' USING ERRCODE = '23514';
  END IF;
  IF NEW.media_type NOT IN ('photo', 'video') OR (NEW.media_type = 'video' AND NOT e.allow_videos) THEN
    RAISE EXCEPTION 'Media type is not allowed' USING ERRCODE = '23514';
  END IF;
  IF public.storage_event_id(NEW.storage_path) IS DISTINCT FROM NEW.event_id
     OR (NEW.guest_id IS NOT NULL AND
         (storage.foldername(NEW.storage_path))[2] IS DISTINCT FROM NEW.guest_id::text)
     OR (NEW.guest_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.guests g WHERE g.id = NEW.guest_id AND g.event_id = NEW.event_id
     )) THEN
    RAISE EXCEPTION 'Invalid event media path' USING ERRCODE = '23514';
  END IF;
  bucket := CASE WHEN NEW.media_type = 'video' THEN 'videos' ELSE 'photos' END;
  SELECT o.metadata INTO meta FROM storage.objects o
    WHERE o.bucket_id = bucket AND o.name = NEW.storage_path;
  IF meta IS NULL OR coalesce(meta->>'size','') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Uploaded media object or size metadata missing' USING ERRCODE = '23514';
  END IF;
  actual_bytes := (meta->>'size')::bigint;
  IF actual_bytes <= 0 OR actual_bytes > (CASE WHEN bucket = 'videos' THEN 52428800 ELSE 15728640 END)
    OR NOT coalesce(meta->>'mimetype','') = ANY (
      CASE WHEN bucket = 'videos' THEN ARRAY['video/mp4','video/webm']
      ELSE ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'] END
    ) THEN
    RAISE EXCEPTION 'Invalid uploaded media size or content type' USING ERRCODE = '23514';
  END IF;
  IF NEW.thumbnail_path IS NOT NULL THEN
    IF public.storage_event_id(NEW.thumbnail_path) IS DISTINCT FROM NEW.event_id
      OR (NEW.guest_id IS NOT NULL AND
          (storage.foldername(NEW.thumbnail_path))[2] IS DISTINCT FROM NEW.guest_id::text) THEN
      RAISE EXCEPTION 'Invalid thumbnail path' USING ERRCODE = '23514';
    END IF;
    SELECT o.metadata INTO meta FROM storage.objects o
      WHERE o.bucket_id = 'thumbnails' AND o.name = NEW.thumbnail_path;
    IF meta IS NULL OR coalesce(meta->>'size','') !~ '^[0-9]+$'
      OR NOT coalesce(meta->>'mimetype','') = ANY (ARRAY['image/jpeg','image/png','image/webp']) THEN
      RAISE EXCEPTION 'Invalid thumbnail metadata' USING ERRCODE = '23514';
    END IF;
    thumb_bytes := (meta->>'size')::bigint;
    IF thumb_bytes <= 0 OR thumb_bytes > 5242880 THEN
      RAISE EXCEPTION 'Invalid thumbnail size' USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.size_bytes := actual_bytes;
  NEW.quota_bytes := actual_bytes + thumb_bytes;
  IF e.storage_used_mb + NEW.quota_bytes::numeric / 1048576 > e.storage_limit_mb THEN
    RAISE EXCEPTION 'Event storage quota exceeded' USING ERRCODE = '23514';
  END IF;
  UPDATE public.events SET storage_used_mb = storage_used_mb + NEW.quota_bytes::numeric / 1048576
    WHERE id = e.id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.account_photo_storage() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER photos_storage_insert BEFORE INSERT ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.account_photo_storage();
CREATE TRIGGER photos_storage_update BEFORE UPDATE ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.account_photo_storage();
CREATE TRIGGER photos_storage_delete AFTER DELETE ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.account_photo_storage();

CREATE OR REPLACE FUNCTION public.join_event(
  _slug text, _name text, _password text DEFAULT NULL, _device_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.events; g public.guests; uid uuid := auth.uid(); nm text := btrim(coalesce(_name, ''));
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Your session expired. Please try again.'); END IF;
  IF nm = '' OR length(nm) > 80 OR length(_slug) > 100 OR length(_device_id) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid guest details');
  END IF;
  -- All admissions for the same event share this lock, including repeat joins.
  SELECT * INTO e FROM public.events WHERE slug = _slug AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Event not found'); END IF;
  IF e.status = 'archived' THEN RETURN jsonb_build_object('ok', false, 'error', 'This event is closed'); END IF;
  IF e.expires_at IS NOT NULL AND e.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This event has ended');
  END IF;
  IF NOT public.event_password_ok(e.password_hash, _password) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Incorrect password');
  END IF;
  SELECT * INTO g FROM public.guests WHERE event_id = e.id AND user_id = uid;
  IF FOUND THEN
    IF g.is_blocked THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Your access to this event was removed');
    END IF;
    UPDATE public.guests SET name = nm,
      device_info = CASE WHEN _device_id IS NULL THEN device_info
        ELSE jsonb_build_object('device_id', _device_id) END WHERE id = g.id RETURNING * INTO g;
  ELSE
    -- NULL means unlimited; 0 means no new guests. Blocked guests retain their seat.
    IF e.guest_limit IS NOT NULL AND
      (SELECT count(*) FROM public.guests WHERE event_id = e.id) >= e.guest_limit THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This event has reached its guest limit');
    END IF;
    INSERT INTO public.guests (event_id, name, user_id, device_info)
    VALUES (e.id, nm, uid, CASE WHEN _device_id IS NULL THEN NULL ELSE jsonb_build_object('device_id', _device_id) END)
    RETURNING * INTO g;
  END IF;
  RETURN jsonb_build_object('ok', true, 'guest', jsonb_build_object('id', g.id, 'name', g.name),
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug,
      'allow_uploads', e.allow_uploads, 'allow_downloads', e.allow_downloads,
      'allow_comments', e.allow_comments, 'allow_likes', e.allow_likes,
      'cover_image_url', e.cover_image_url, 'theme', e.theme));
END $$;
REVOKE ALL ON FUNCTION public.join_event(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_event(text, text, text, text) TO authenticated;

-- Fix the existing unqualified `name`, which bound to e.name instead of the object.
DROP POLICY "event media host manage" ON storage.objects;
CREATE POLICY "event media host manage" ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id IN ('photos','thumbnails','covers','exports') AND EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = public.storage_event_id(storage.objects.name)
      AND e.owner_id = auth.uid()
  )
) WITH CHECK (
  bucket_id IN ('photos','thumbnails','covers','exports') AND EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = public.storage_event_id(storage.objects.name)
      AND e.owner_id = auth.uid()
  )
);
-- Compensating cleanup after registration failure: only the uploader's own
-- unregistered object. Registered pending/rejected media never matches this rule.
CREATE FUNCTION public.is_own_unregistered_upload(_bucket text, _path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _bucket IN ('photos','thumbnails')
    AND auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.guests g
      WHERE g.event_id = public.storage_event_id(_path) AND g.user_id = auth.uid()
        AND g.id::text = (storage.foldername(_path))[2])
    AND NOT EXISTS (SELECT 1 FROM public.photos p WHERE
      (_bucket = 'photos' AND p.storage_path = _path AND p.media_type = 'photo')
      OR (_bucket = 'thumbnails' AND p.thumbnail_path = _path))
$$;
REVOKE ALL ON FUNCTION public.is_own_unregistered_upload(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_own_unregistered_upload(text,text) TO authenticated;
CREATE POLICY "guest unregistered upload read" ON storage.objects FOR SELECT TO authenticated
  USING (public.is_own_unregistered_upload(bucket_id, name));
CREATE POLICY "guest unregistered upload cleanup" ON storage.objects FOR DELETE TO authenticated
  USING (public.is_own_unregistered_upload(bucket_id, name));

-- Lock down replacement of registered media: upsert must not change its bytes
-- behind the accounting trigger. Ordinary host metadata moderation still works.
CREATE POLICY "registered media immutable" ON storage.objects AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (
  bucket_id NOT IN ('photos','thumbnails','videos') OR NOT EXISTS (
    SELECT 1 FROM public.photos p WHERE
      (storage.objects.bucket_id = 'photos' AND p.media_type = 'photo' AND p.storage_path = storage.objects.name)
      OR (storage.objects.bucket_id = 'videos' AND p.media_type = 'video' AND p.storage_path = storage.objects.name)
      OR (storage.objects.bucket_id = 'thumbnails' AND p.thumbnail_path = storage.objects.name)
  )
) WITH CHECK (
  bucket_id NOT IN ('photos','thumbnails','videos') OR NOT EXISTS (
    SELECT 1 FROM public.photos p WHERE
      (storage.objects.bucket_id = 'photos' AND p.media_type = 'photo' AND p.storage_path = storage.objects.name)
      OR (storage.objects.bucket_id = 'videos' AND p.media_type = 'video' AND p.storage_path = storage.objects.name)
      OR (storage.objects.bucket_id = 'thumbnails' AND p.thumbnail_path = storage.objects.name)
  )
);

-- Direct host inserts must not bypass the admission cap enforced by join_event.
CREATE FUNCTION public.enforce_guest_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cap integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.event_id = OLD.event_id THEN RETURN NEW; END IF;
  SELECT guest_limit INTO cap FROM public.events WHERE id = NEW.event_id FOR UPDATE;
  IF cap IS NOT NULL AND (SELECT count(*) FROM public.guests WHERE event_id = NEW.event_id) >= cap THEN
    RAISE EXCEPTION 'Event guest limit reached' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_guest_capacity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guests_capacity BEFORE INSERT OR UPDATE OF event_id ON public.guests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_guest_capacity();

-- ROLLBACK (coordinate with code; back up counters before rolling back):
-- DROP TRIGGER guests_capacity ON public.guests;
-- DROP FUNCTION public.enforce_guest_capacity();
-- DROP POLICY "registered media immutable" ON storage.objects;
-- DROP POLICY "guest unregistered upload cleanup" ON storage.objects;
-- DROP POLICY "guest unregistered upload read" ON storage.objects;
-- DROP FUNCTION public.is_own_unregistered_upload(text,text);
-- DROP TRIGGER photos_storage_delete ON public.photos;
-- DROP TRIGGER photos_storage_update ON public.photos;
-- DROP TRIGGER photos_storage_insert ON public.photos;
-- DROP FUNCTION public.account_photo_storage();
-- DROP INDEX public.photos_thumbnail_object_unique;
-- DROP INDEX public.photos_media_object_unique;
-- ALTER TABLE public.photos DROP COLUMN quota_bytes;
-- ALTER TABLE public.events DROP CONSTRAINT events_storage_limit_nonnegative,
--   DROP CONSTRAINT events_storage_used_nonnegative, DROP CONSTRAINT events_guest_limit_nonnegative;
-- UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
--   WHERE id = 'photos';
-- UPDATE storage.buckets SET file_size_limit = 209715200 WHERE id = 'videos';
-- Keep the corrected host Storage policy: reverting it would reintroduce a bug.
-- Counters retain their last reconciled values; rolling back cannot reconstruct
-- their previously inaccurate values. No media objects are deleted by rollback.

-- Restore the previous join_event definition (rollback SQL):
-- CREATE OR REPLACE FUNCTION public.join_event(
--   _slug text, _name text, _password text DEFAULT NULL, _device_id text DEFAULT NULL
-- ) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
-- DECLARE e public.events; g public.guests; uid uuid := auth.uid(); nm text := btrim(coalesce(_name, ''));
-- BEGIN
--   IF uid IS NULL THEN
--     RETURN jsonb_build_object('ok', false, 'error', 'Your session expired. Please try again.');
--   END IF;
--   IF nm = '' THEN
--     RETURN jsonb_build_object('ok', false, 'error', 'Enter your name');
--   END IF;
--
--   SELECT * INTO e FROM public.events WHERE slug = _slug AND deleted_at IS NULL;
--   IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Event not found'); END IF;
--   IF e.status = 'archived' THEN RETURN jsonb_build_object('ok', false, 'error', 'This event is closed'); END IF;
--   IF e.expires_at IS NOT NULL AND e.expires_at < now() THEN
--     RETURN jsonb_build_object('ok', false, 'error', 'This event has ended');
--   END IF;
--   IF NOT public.event_password_ok(e.password_hash, _password) THEN
--     RETURN jsonb_build_object('ok', false, 'error', 'Incorrect password');
--   END IF;
--
--   SELECT * INTO g FROM public.guests WHERE event_id = e.id AND user_id = uid;
--   IF FOUND THEN
--     IF g.is_blocked THEN
--       RETURN jsonb_build_object('ok', false, 'error', 'Your access to this event was removed');
--     END IF;
--     UPDATE public.guests
--        SET name = nm,
--            device_info = CASE WHEN _device_id IS NULL THEN device_info
--                               ELSE jsonb_build_object('device_id', _device_id) END
--      WHERE id = g.id
--      RETURNING * INTO g;
--   ELSE
--     INSERT INTO public.guests (event_id, name, user_id, device_info)
--     VALUES (e.id, nm, uid,
--             CASE WHEN _device_id IS NULL THEN NULL ELSE jsonb_build_object('device_id', _device_id) END)
--     RETURNING * INTO g;
--   END IF;
--
--   RETURN jsonb_build_object(
--     'ok', true,
--     'guest', jsonb_build_object('id', g.id, 'name', g.name),
--     'event', jsonb_build_object(
--       'id', e.id, 'name', e.name, 'slug', e.slug,
--       'allow_uploads', e.allow_uploads, 'allow_downloads', e.allow_downloads,
--       'allow_comments', e.allow_comments, 'allow_likes', e.allow_likes,
--       'cover_image_url', e.cover_image_url, 'theme', e.theme)
--   );
-- END $$;
-- REVOKE ALL ON FUNCTION public.join_event(text, text, text, text) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.join_event(text, text, text, text) TO authenticated;
