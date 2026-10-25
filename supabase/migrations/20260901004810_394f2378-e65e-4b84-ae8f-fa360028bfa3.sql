-- ============================================================
-- Guests become anonymous auth users; all privileged guest work
-- moves into SECURITY DEFINER functions + RLS. No service role.
-- ============================================================

ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS guests_event_user_uniq
  ON public.guests(event_id, user_id) WHERE user_id IS NOT NULL;

-- ---- password verification (internal helper, no client grants) ----
CREATE OR REPLACE FUNCTION public.event_password_ok(_hash text, _password text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE h text;
BEGIN
  IF _hash IS NULL THEN RETURN true; END IF;
  IF _password IS NULL OR _password = '' THEN RETURN false; END IF;
  -- bcryptjs emits $2b$/$2y$; pgcrypto understands $2a$ (compatible for <72 byte inputs)
  h := replace(replace(_hash, '$2b$', '$2a$'), '$2y$', '$2a$');
  BEGIN
    RETURN extensions.crypt(_password, h) = h;
  EXCEPTION WHEN others THEN RETURN false; END;
END $$;
REVOKE ALL ON FUNCTION public.event_password_ok(text, text) FROM PUBLIC, anon, authenticated;

-- ---- guest identity helpers ----
CREATE OR REPLACE FUNCTION public.current_event_guest_id(_event_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id FROM public.guests g
  WHERE g.event_id = _event_id AND g.user_id = auth.uid() AND g.is_blocked = false
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.current_event_guest_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_event_guest_id(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_event_guest(_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_event_guest_id(_event_id) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.is_event_guest(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_event_guest(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.event_uploads_open(_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id AND e.deleted_at IS NULL
      AND e.status <> 'archived' AND e.allow_uploads
      AND (e.expires_at IS NULL OR e.expires_at > now())
  )
$$;
REVOKE ALL ON FUNCTION public.event_uploads_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_uploads_open(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.event_comments_open(_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id AND e.deleted_at IS NULL
      AND e.status <> 'archived' AND e.allow_comments
  )
$$;
REVOKE ALL ON FUNCTION public.event_comments_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_comments_open(uuid) TO authenticated;

-- ---- public (pre-join) event info: only safe columns ----
CREATE OR REPLACE FUNCTION public.event_public_info(_slug text)
RETURNS TABLE (
  id uuid, name text, description text, cover_image_url text,
  has_password boolean, theme jsonb, status text, expires_at timestamptz,
  allow_uploads boolean, allow_downloads boolean, allow_comments boolean, allow_likes boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.name, e.description, e.cover_image_url,
         e.password_hash IS NOT NULL, e.theme, e.status, e.expires_at,
         e.allow_uploads, e.allow_downloads, e.allow_comments, e.allow_likes
  FROM public.events e
  WHERE e.slug = _slug AND e.deleted_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.event_public_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_public_info(text) TO anon, authenticated;

-- ---- join an event (password checked inside the database) ----
CREATE OR REPLACE FUNCTION public.join_event(
  _slug text, _name text, _password text DEFAULT NULL, _device_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.events; g public.guests; uid uuid := auth.uid(); nm text := btrim(coalesce(_name, ''));
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Your session expired. Please try again.');
  END IF;
  IF nm = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Enter your name');
  END IF;

  SELECT * INTO e FROM public.events WHERE slug = _slug AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Event not found'); END IF;
  IF e.status = 'archived' THEN RETURN jsonb_build_object('ok', false, 'error', 'This event is closed'); END IF;
  IF e.expires_at IS NOT NULL AND e.expires_at < now() THEN
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
    UPDATE public.guests
       SET name = nm,
           device_info = CASE WHEN _device_id IS NULL THEN device_info
                              ELSE jsonb_build_object('device_id', _device_id) END
     WHERE id = g.id
     RETURNING * INTO g;
  ELSE
    INSERT INTO public.guests (event_id, name, user_id, device_info)
    VALUES (e.id, nm, uid,
            CASE WHEN _device_id IS NULL THEN NULL ELSE jsonb_build_object('device_id', _device_id) END)
    RETURNING * INTO g;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'guest', jsonb_build_object('id', g.id, 'name', g.name),
    'event', jsonb_build_object(
      'id', e.id, 'name', e.name, 'slug', e.slug,
      'allow_uploads', e.allow_uploads, 'allow_downloads', e.allow_downloads,
      'allow_comments', e.allow_comments, 'allow_likes', e.allow_likes,
      'cover_image_url', e.cover_image_url, 'theme', e.theme)
  );
END $$;
REVOKE ALL ON FUNCTION public.join_event(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_event(text, text, text, text) TO authenticated;

-- ---- current guest session for the signed-in (anonymous) user ----
CREATE OR REPLACE FUNCTION public.my_guest_session(_slug text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.guests; e public.events;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT gu.* INTO g
    FROM public.guests gu
    JOIN public.events ev ON ev.id = gu.event_id
   WHERE gu.user_id = auth.uid() AND gu.is_blocked = false
     AND ev.deleted_at IS NULL AND ev.status <> 'archived'
     AND (_slug IS NULL OR ev.slug = _slug)
   ORDER BY gu.joined_at DESC
   LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT * INTO e FROM public.events WHERE id = g.event_id;
  RETURN jsonb_build_object(
    'ok', true,
    'guest', jsonb_build_object('id', g.id, 'name', g.name),
    'event', jsonb_build_object(
      'id', e.id, 'name', e.name, 'slug', e.slug,
      'allow_uploads', e.allow_uploads, 'allow_downloads', e.allow_downloads,
      'allow_comments', e.allow_comments, 'allow_likes', e.allow_likes,
      'cover_image_url', e.cover_image_url, 'theme', e.theme)
  );
END $$;
REVOKE ALL ON FUNCTION public.my_guest_session(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_guest_session(text) TO authenticated;

-- ---- guest write access via RLS ----
GRANT SELECT, INSERT ON public.photos TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.likes TO authenticated;
GRANT SELECT, INSERT ON public.comments TO authenticated;

DROP POLICY IF EXISTS "photos guest insert" ON public.photos;
CREATE POLICY "photos guest insert" ON public.photos FOR INSERT TO authenticated
WITH CHECK (
  guest_id IS NOT NULL
  AND guest_id = public.current_event_guest_id(event_id)
  AND public.event_uploads_open(event_id)
  AND deleted_at IS NULL
);

DROP POLICY IF EXISTS "likes guest insert" ON public.likes;
CREATE POLICY "likes guest insert" ON public.likes FOR INSERT TO authenticated
WITH CHECK (
  guest_id = public.current_event_guest_id(
    (SELECT p.event_id FROM public.photos p WHERE p.id = photo_id)
  )
);

DROP POLICY IF EXISTS "likes guest delete" ON public.likes;
CREATE POLICY "likes guest delete" ON public.likes FOR DELETE TO authenticated
USING (
  guest_id = public.current_event_guest_id(
    (SELECT p.event_id FROM public.photos p WHERE p.id = photo_id)
  )
);

DROP POLICY IF EXISTS "comments guest insert" ON public.comments;
CREATE POLICY "comments guest insert" ON public.comments FOR INSERT TO authenticated
WITH CHECK (
  guest_id = public.current_event_guest_id(
    (SELECT p.event_id FROM public.photos p WHERE p.id = photo_id)
  )
  AND public.event_comments_open(
    (SELECT p.event_id FROM public.photos p WHERE p.id = photo_id)
  )
);

-- ---- storage: event-scoped access without the service role ----
CREATE OR REPLACE FUNCTION public.storage_event_id(_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  RETURN ((storage.foldername(_name))[1])::uuid;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION public.storage_event_id(text) TO anon, authenticated;

DROP POLICY IF EXISTS "event media read" ON storage.objects;
CREATE POLICY "event media read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('photos', 'thumbnails', 'covers')
  AND public.storage_event_id(name) IS NOT NULL
  AND (
    public.is_event_guest(public.storage_event_id(name))
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = public.storage_event_id(name) AND e.owner_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "event media guest upload" ON storage.objects;
CREATE POLICY "event media guest upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('photos', 'thumbnails')
  AND public.event_uploads_open(public.storage_event_id(name))
  AND public.current_event_guest_id(public.storage_event_id(name))::text
      = (storage.foldername(name))[2]
);

DROP POLICY IF EXISTS "event media host manage" ON storage.objects;
CREATE POLICY "event media host manage" ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id IN ('photos', 'thumbnails', 'covers', 'exports')
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = public.storage_event_id(name) AND e.owner_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id IN ('photos', 'thumbnails', 'covers', 'exports')
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = public.storage_event_id(name) AND e.owner_id = auth.uid()
  )
);