
-- 1) has_role / handle_new_user: revoke EXECUTE from authenticated/anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_guest_id() FROM PUBLIC, anon, authenticated;

-- 2) Restrict anon column access to guests (hide device_info)
REVOKE SELECT ON public.guests FROM anon;
GRANT SELECT (id, event_id, name, avatar_url, joined_at, is_blocked) ON public.guests TO anon;

-- 3) Downloads: explicit deny for anon/authenticated inserts (server-only via service_role)
CREATE POLICY "downloads no client insert" ON public.downloads
  FOR INSERT TO anon, authenticated WITH CHECK (false);

-- 4) Guest sessions: explicit deny-all policy (documents server-only access)
CREATE POLICY "guest_sessions deny all" ON public.guest_sessions
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 5) Storage.objects: explicit deny for anon/authenticated on our private buckets.
-- All access flows through service_role (bypasses RLS) via signed URLs / admin client.
DO $$
DECLARE b text;
BEGIN
  FOR b IN SELECT unnest(ARRAY['avatars','covers','photos','videos','thumbnails','exports','temporary'])
  LOOP
    EXECUTE format($f$
      CREATE POLICY %I ON storage.objects
        FOR ALL TO anon, authenticated
        USING (bucket_id <> %L)
        WITH CHECK (bucket_id <> %L);
    $f$, 'deny_client_' || b, b, b);
  END LOOP;
END$$;
