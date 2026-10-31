-- A2: protect limits both at creation and during later settings updates.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.events FROM PUBLIC, anon, authenticated;
DO $$ DECLARE cols text; BEGIN
  SELECT string_agg(quote_ident(attname), ', ') INTO cols
  FROM pg_attribute WHERE attrelid = 'public.events'::regclass
    AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE UPDATE (%s), INSERT (%s) ON public.events FROM PUBLIC, anon, authenticated', cols, cols);
END $$;
GRANT INSERT (
  owner_id, slug, name, description, venue, event_date, cover_image_url,
  password_hash, status, allow_downloads, allow_uploads, allow_videos,
  allow_comments, allow_likes, show_exif, theme, watermark_url,
  watermark_opacity, visibility
) ON public.events TO authenticated;
GRANT UPDATE (
  name, description, venue, event_date, cover_image_url, password_hash, status,
  allow_downloads, allow_uploads, allow_videos, allow_comments, allow_likes,
  show_exif, theme, watermark_url, watermark_opacity, visibility
) ON public.events TO authenticated;

CREATE FUNCTION public.archive_owned_event(_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Host sign-in required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.events SET status = 'archived', deleted_at = now()
  WHERE id = _event_id AND owner_id = auth.uid() AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found or already archived' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.archive_owned_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_owned_event(uuid) TO authenticated;

-- ROLLBACK (deploy the old archive caller together with this rollback):
-- DROP FUNCTION public.archive_owned_event(uuid);
-- GRANT INSERT, UPDATE, DELETE ON public.events TO authenticated;
-- As in A1, unnecessary anon/TRUNCATE/REFERENCES/TRIGGER grants stay revoked.
