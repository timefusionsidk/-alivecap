-- SQL regression suite: run after migrations in a DISPOSABLE local/staging DB.
-- Run with psql -v ON_ERROR_STOP=1 -f supabase/tests/a1_a3_security.sql
-- Everything rolls back; storage.objects rows here are metadata-only fixtures.
BEGIN;
DO $$ BEGIN
  IF (SELECT file_size_limit FROM storage.buckets WHERE id='photos') <> 15728640
    OR (SELECT file_size_limit FROM storage.buckets WHERE id='thumbnails') <> 5242880
    OR (SELECT file_size_limit FROM storage.buckets WHERE id='videos') <> 52428800 THEN
    RAISE EXCEPTION 'FAIL: bucket limits';
  END IF;
END $$;
INSERT INTO auth.users(id,email) VALUES
 ('10000000-0000-0000-0000-000000000001','a1-host@example.invalid'),
 ('10000000-0000-0000-0000-000000000002','a1-other@example.invalid');
INSERT INTO auth.users(id) VALUES
 ('20000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002');
INSERT INTO public.events(id,owner_id,slug,name,status,guest_limit,storage_limit_mb) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','a1-security-one','Test event one','active',1,1),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','a1-security-two','Test event two','active',NULL,1);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT set_config('request.jwt.claims','{"is_anonymous":false}',true);
DO $$ BEGIN
  UPDATE public.users SET full_name='Allowed', avatar_url='https://example.invalid/avatar.png'
    WHERE id=auth.uid();
  BEGIN
    UPDATE public.users SET plan='enterprise' WHERE id=auth.uid();
    RAISE EXCEPTION 'FAIL: plan escalation permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    TRUNCATE public.users CASCADE;
    RAISE EXCEPTION 'FAIL: TRUNCATE permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.events SET storage_limit_mb=999999 WHERE owner_id=auth.uid();
    RAISE EXCEPTION 'FAIL: quota escalation permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.events SET storage_used_mb=0, guest_limit=NULL, expires_at=NULL, deleted_at=NULL WHERE owner_id=auth.uid();
    RAISE EXCEPTION 'FAIL: protected fields editable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.events SET owner_id='10000000-0000-0000-0000-000000000002' WHERE owner_id=auth.uid();
    RAISE EXCEPTION 'FAIL: owner editable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.events(owner_id,slug,name,storage_limit_mb)
      VALUES(auth.uid(),'a1-injected','Injection',999999);
    RAISE EXCEPTION 'FAIL: quota injection on create permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO public.events(owner_id,slug,name,status) VALUES(auth.uid(),'a1-normal','Normal creation','active');
  UPDATE public.events SET name='Allowed name',allow_uploads=true,allow_comments=false,
    password_hash=NULL,status='active' WHERE slug='a1-security-one';
  BEGIN
    PERFORM public.archive_owned_event('30000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'FAIL: another host event archived';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT set_config('request.jwt.claims','{"is_anonymous":true}',true);
DO $$ DECLARE r jsonb; BEGIN
  r := public.join_event('a1-security-one','First guest');
  IF r->>'ok' <> 'true' THEN RAISE EXCEPTION 'FAIL: first join: %',r; END IF;
  r := public.join_event('a1-security-one','Returning guest');
  IF r->>'ok' <> 'true' THEN RAISE EXCEPTION 'FAIL: rejoin at cap: %',r; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
DO $$ DECLARE r jsonb; BEGIN
  r := public.join_event('a1-security-one','Second guest');
  IF r->>'ok' <> 'false' OR r->>'error' NOT LIKE '%guest limit%' THEN RAISE EXCEPTION 'FAIL: cap ignored: %',r; END IF;
END $$;
RESET ROLE;
INSERT INTO storage.objects(bucket_id,name,metadata)
SELECT 'photos', e.id::text||'/'||g.id::text||'/first.jpg', '{"size":1048576,"mimetype":"image/jpeg"}'
 FROM public.events e JOIN public.guests g ON g.event_id=e.id WHERE e.slug='a1-security-one';
INSERT INTO storage.objects(bucket_id,name,metadata)
SELECT 'photos', e.id::text||'/'||g.id::text||'/second.jpg', '{"size":1,"mimetype":"image/jpeg"}'
 FROM public.events e JOIN public.guests g ON g.event_id=e.id WHERE e.slug='a1-security-one';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
-- Spoofed size is ignored; trusted Storage metadata decides quota usage.
INSERT INTO public.photos(event_id,guest_id,storage_path,size_bytes)
SELECT '30000000-0000-0000-0000-000000000001',public.current_event_guest_id('30000000-0000-0000-0000-000000000001'),
 '30000000-0000-0000-0000-000000000001/'||public.current_event_guest_id('30000000-0000-0000-0000-000000000001')||'/first.jpg',1;
DO $$ BEGIN
  IF (SELECT size_bytes FROM public.photos LIMIT 1) <> 1048576 THEN RAISE EXCEPTION 'FAIL: size spoofed'; END IF;
  BEGIN
    INSERT INTO public.photos(event_id,guest_id,storage_path,size_bytes)
    VALUES('30000000-0000-0000-0000-000000000001',public.current_event_guest_id('30000000-0000-0000-0000-000000000001'),
      '30000000-0000-0000-0000-000000000001/'||public.current_event_guest_id('30000000-0000-0000-0000-000000000001')||'/second.jpg',0);
    RAISE EXCEPTION 'FAIL: over-quota insert allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
  IF (public.join_event('a1-security-two','Other event guest')->>'ok') <> 'true' THEN RAISE EXCEPTION 'FAIL: other event join'; END IF;
  IF EXISTS(SELECT 1 FROM public.photos) THEN RAISE EXCEPTION 'FAIL: cross-event photos readable'; END IF;
  IF EXISTS(SELECT 1 FROM storage.objects) THEN RAISE EXCEPTION 'FAIL: cross-event objects readable'; END IF;
END $$;
RESET ROLE;
UPDATE public.guests SET is_blocked=true WHERE user_id='20000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.photos) THEN RAISE EXCEPTION 'FAIL: blocked guest photos readable'; END IF;
  IF EXISTS(SELECT 1 FROM storage.objects o WHERE o.name LIKE '%/first.jpg') THEN
    RAISE EXCEPTION 'FAIL: blocked guest registered object readable'; END IF;
  IF (public.join_event('a1-security-one','Blocked')->>'ok') <> 'false' THEN RAISE EXCEPTION 'FAIL: blocked rejoin'; END IF;
END $$;
RESET ROLE;
UPDATE public.guests SET is_blocked=false WHERE user_id='20000000-0000-0000-0000-000000000001';
UPDATE public.events SET expires_at=now()-interval '1 minute' WHERE slug='a1-security-one';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.photos(event_id,guest_id,storage_path,size_bytes)
    VALUES('30000000-0000-0000-0000-000000000001',public.current_event_guest_id('30000000-0000-0000-0000-000000000001'),
      '30000000-0000-0000-0000-000000000001/'||public.current_event_guest_id('30000000-0000-0000-0000-000000000001')||'/second.jpg',1);
    RAISE EXCEPTION 'FAIL: expired upload permitted';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN NULL; END;
  IF (public.join_event('a1-security-one','Late guest')->>'ok') <> 'false' THEN RAISE EXCEPTION 'FAIL: expired join'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT storage_used_mb FROM public.events WHERE slug='a1-security-one') <> 1 THEN RAISE EXCEPTION 'FAIL: inaccurate counter'; END IF;
END $$;
-- A hide/reject does not refund quota while its object is retained.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT set_config('request.jwt.claims','{"is_anonymous":false}',true);
UPDATE public.photos SET deleted_at=now(),status='rejected';
DO $$ BEGIN
  IF (SELECT storage_used_mb FROM public.events WHERE slug='a1-security-one') <> 1 THEN RAISE EXCEPTION 'FAIL: soft-delete refunded bytes'; END IF;
  BEGIN
    UPDATE public.photos SET size_bytes=0;
    RAISE EXCEPTION 'FAIL: registered size editable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- Host reads must use object name, not event name, even for rejected photos.
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE name LIKE '%/first.jpg') THEN RAISE EXCEPTION 'FAIL: host Storage policy'; END IF;
END $$;
-- Replacement cannot silently increase the size of a registered original.
UPDATE storage.objects SET metadata='{"size":2097152,"mimetype":"image/jpeg"}'
  WHERE name LIKE '%/first.jpg';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM storage.objects WHERE name LIKE '%/first.jpg' AND (metadata->>'size')::bigint <> 1048576) THEN
    RAISE EXCEPTION 'FAIL: registered Storage object replaced';
  END IF;
END $$;
DELETE FROM public.photos;
DO $$ BEGIN
  IF (SELECT storage_used_mb FROM public.events WHERE slug='a1-security-one') <> 0 THEN RAISE EXCEPTION 'FAIL: delete did not refund'; END IF;
END $$;
-- Direct host insertion is also capped, rather than bypassing join_event.
DO $$ BEGIN
  BEGIN
    INSERT INTO public.guests(event_id,name,user_id)
    VALUES('30000000-0000-0000-0000-000000000001','Bypass','20000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'FAIL: host bypassed guest capacity';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT public.archive_owned_event('30000000-0000-0000-0000-000000000001');
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.events WHERE slug='a1-security-one' AND deleted_at IS NOT NULL AND status='archived') THEN RAISE EXCEPTION 'FAIL: owner archive'; END IF;
END $$;
RESET ROLE;
-- Thumbnail bytes are charged separately from the original size_bytes.
UPDATE public.events SET storage_limit_mb=1 WHERE slug='a1-security-two';
INSERT INTO storage.objects(bucket_id,name,metadata)
SELECT 'photos',g.event_id::text||'/'||g.id::text||'/small.jpg','{"size":524288,"mimetype":"image/jpeg"}'
FROM public.guests g WHERE g.event_id='30000000-0000-0000-0000-000000000002';
INSERT INTO storage.objects(bucket_id,name,metadata)
SELECT 'thumbnails',g.event_id::text||'/'||g.id::text||'/small.jpg','{"size":524288,"mimetype":"image/jpeg"}'
FROM public.guests g WHERE g.event_id='30000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
SELECT set_config('request.jwt.claims','{"is_anonymous":true}',true);
INSERT INTO public.photos(event_id,guest_id,storage_path,thumbnail_path,size_bytes,quota_bytes)
SELECT '30000000-0000-0000-0000-000000000002', public.current_event_guest_id('30000000-0000-0000-0000-000000000002'),
  '30000000-0000-0000-0000-000000000002/'||public.current_event_guest_id('30000000-0000-0000-0000-000000000002')||'/small.jpg',
  '30000000-0000-0000-0000-000000000002/'||public.current_event_guest_id('30000000-0000-0000-0000-000000000002')||'/small.jpg',0,0;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT storage_used_mb FROM public.events WHERE slug='a1-security-two') <> 1 THEN RAISE EXCEPTION 'FAIL: thumbnail not charged'; END IF;
  IF (SELECT size_bytes FROM public.photos WHERE event_id='30000000-0000-0000-0000-000000000002') <> 524288 THEN RAISE EXCEPTION 'FAIL: original size altered by thumbnail'; END IF;
END $$;
UPDATE public.events SET storage_limit_mb=10 WHERE slug='a1-security-two';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.photos(event_id,guest_id,storage_path)
    VALUES('30000000-0000-0000-0000-000000000002',public.current_event_guest_id('30000000-0000-0000-0000-000000000002'),
      '30000000-0000-0000-0000-000000000002/'||public.current_event_guest_id('30000000-0000-0000-0000-000000000002')||'/missing.jpg');
    RAISE EXCEPTION 'FAIL: missing object registered';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.photos(event_id,guest_id,storage_path)
    VALUES('30000000-0000-0000-0000-000000000002',public.current_event_guest_id('30000000-0000-0000-0000-000000000002'),
      '30000000-0000-0000-0000-000000000002/'||public.current_event_guest_id('30000000-0000-0000-0000-000000000002')||'/small.jpg');
    RAISE EXCEPTION 'FAIL: duplicate registration';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  -- A registered object cannot be deleted by the guest cleanup policy.
  DELETE FROM storage.objects WHERE name LIKE '%/small.jpg';
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE name LIKE '%/small.jpg') THEN RAISE EXCEPTION 'FAIL: guest deleted registered original'; END IF;
END $$;
-- Exercise the compensating orphan cleanup policy through actual RLS.
INSERT INTO storage.objects(bucket_id,name,metadata)
SELECT 'photos','30000000-0000-0000-0000-000000000002/'||public.current_event_guest_id('30000000-0000-0000-0000-000000000002')||'/orphan.jpg',
  '{"size":1,"mimetype":"image/jpeg"}';
DELETE FROM storage.objects WHERE name LIKE '%/orphan.jpg';
RESET ROLE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM storage.objects WHERE name LIKE '%/orphan.jpg') THEN RAISE EXCEPTION 'FAIL: orphan cleanup denied'; END IF;
END $$;
ROLLBACK;
