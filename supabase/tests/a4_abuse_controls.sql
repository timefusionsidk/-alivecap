-- Run only on a disposable local/staging stack after A1–A4. No HTTP/Auth emulation.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, explanation text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF condition IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %',explanation; END IF;
END $$;
INSERT INTO auth.users(id,email) VALUES('41000000-0000-0000-0000-000000000001','a4-host@example.invalid');
INSERT INTO auth.users(id) VALUES('42000000-0000-0000-0000-000000000001'),('42000000-0000-0000-0000-000000000002');
INSERT INTO public.events(id,owner_id,slug,name,status,password_hash) VALUES
 ('43000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','a4-one','A4 One','active',extensions.crypt('correct-horse',extensions.gen_salt('bf',4))),
 ('43000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000001','a4-two','A4 Two','active',NULL);
SELECT pg_temp.assert_true(public.event_password_ok((SELECT password_hash FROM public.events WHERE slug='a4-one'),'correct-horse'),'real bcrypt verification');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','42000000-0000-0000-0000-000000000001',true);
SELECT set_config('request.jwt.claims','{"is_anonymous":true}',true);
DO $$ DECLARE r jsonb; BEGIN
  FOR i IN 1..4 LOOP
    r:=public.join_event('a4-one','A4 Guest','wrong','44000000-0000-0000-0000-000000000001');
    PERFORM pg_temp.assert_true(r->>'error'='Incorrect password','initial failures still reject');
  END LOOP;
  r:=public.join_event('a4-one','A4 Guest','wrong','44000000-0000-0000-0000-000000000001');
  PERFORM pg_temp.assert_true(r->>'error_code'='rate_limited' AND (r->>'retry_after_seconds')::int=900,'fifth failure locks');
  r:=public.join_event('a4-one','A4 Guest','correct-horse','44000000-0000-0000-0000-000000000001');
  PERFORM pg_temp.assert_true(r->>'error_code'='rate_limited','correct password cannot bypass active lockout');
  r:=public.join_event('a4-one','A4 Guest','correct-horse','44000000-0000-0000-0000-000000000002');
  PERFORM pg_temp.assert_true(r->>'error_code'='rate_limited','changing device does not bypass user lock');
  -- Each private helper/table is denied through its ordinary SQL interface.
  BEGIN PERFORM public.join_event_core_a4('a4-one','Bypass','correct-horse',NULL);
    RAISE EXCEPTION 'FAIL: unguarded core callable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.prune_abuse_attempts();
    RAISE EXCEPTION 'FAIL: client can prune'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.event_join_attempts;
    RAISE EXCEPTION 'FAIL: client reads attempts'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.event_join_attempts;
    RAISE EXCEPTION 'FAIL: client clears lockout'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.guest_write_attempts(guest_id,action) VALUES(gen_random_uuid(),'upload');
    RAISE EXCEPTION 'FAIL: client fabricates write ledger'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*) FROM public.event_join_attempts WHERE scope='user' AND attempts=5)=1,'failures persisted despite returned errors');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.guests),'failed joins never create a guest');
SELECT pg_temp.assert_true((SELECT attempts FROM public.event_join_attempts WHERE scope='slug')=5,'blocked identities do not spend the event-wide budget');
-- Lockout reads do not extend the original expiry.
SELECT pg_temp.assert_true((SELECT max(blocked_until)-min(blocked_until) FROM public.event_join_attempts WHERE attempts=5)=interval '0','blocked requests do not extend lock');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','42000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert_true(public.join_event('a4-one','Fresh identity','correct-horse','44000000-0000-0000-0000-000000000001')->>'error_code'='rate_limited','changing user does not bypass device lock');
SELECT pg_temp.assert_true(public.join_event('a4-one','Independent guest','correct-horse','44000000-0000-0000-0000-000000000003')->>'ok'='true','another device and user can join');
SELECT pg_temp.assert_true(public.join_event('a4-two','Other event',NULL,NULL)->>'ok'='true','locks are event-scoped, device optional');
RESET ROLE;
-- Expire failure windows without waiting in a test.
UPDATE public.event_join_attempts SET window_started_at=clock_timestamp()-interval '16 minutes',
 failure_times=ARRAY(SELECT ts-interval '16 minutes' FROM unnest(failure_times) ts),
 blocked_until=clock_timestamp()-interval '1 second' WHERE scope IN ('user','device');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','42000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert_true(public.join_event('a4-one','Recovered','correct-horse','44000000-0000-0000-0000-000000000001')->>'ok'='true','join recovers after expiry');
RESET ROLE;
-- Success cannot erase recent failures, and an old bookkeeping window does
-- not erase recent failures that still belong to the rolling 15-minute history.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.join_event('a4-one','One new mistake','wrong','44000000-0000-0000-0000-000000000001')->>'error'='Incorrect password','fresh failure');
SELECT pg_temp.assert_true(public.join_event('a4-one','Valid retry','correct-horse','44000000-0000-0000-0000-000000000001')->>'ok'='true','valid retry after a mistake');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT attempts FROM public.event_join_attempts
 WHERE scope='user' AND subject_hash=encode(sha256(convert_to('42000000-0000-0000-0000-000000000001','UTF8')),'hex'))=1,'success preserves failures');
UPDATE public.event_join_attempts SET attempts=4,window_started_at=clock_timestamp()-interval '16 minutes',
 failure_times=ARRAY[clock_timestamp()-interval '14 minutes',clock_timestamp()-interval '3 minutes',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute'],blocked_until=NULL
 WHERE scope='user' AND subject_hash=encode(sha256(convert_to('42000000-0000-0000-0000-000000000001','UTF8')),'hex');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.join_event('a4-one','Boundary retry','wrong',NULL)->>'error_code'='rate_limited','recent failures survive an old counter-window boundary');
RESET ROLE;
UPDATE public.event_join_attempts SET failure_times='{}',attempts=0,blocked_until=NULL WHERE scope IN ('user','device');
-- Aggregate slug throttle still rejects rotating identities/devices before bcrypt.
UPDATE public.event_join_attempts SET attempts=120,blocked_until=NULL,window_started_at=clock_timestamp()
 WHERE event_id='43000000-0000-0000-0000-000000000001' AND scope='slug';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.join_event('a4-one','Slug flood','correct-horse','44000000-0000-0000-0000-000000000004')->>'error_code'='rate_limited','slug throttle');
RESET ROLE;
UPDATE public.event_join_attempts SET window_started_at=clock_timestamp()-interval '2 minutes',blocked_until=clock_timestamp()-interval '1 second' WHERE scope='slug';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.join_event('a4-one','After slug timeout','correct-horse','44000000-0000-0000-0000-000000000001')->>'ok'='true','slug throttle recovers');
RESET ROLE;
-- Repeated valid rejoins have a separate per-user ceiling.
UPDATE public.event_join_attempts SET attempts=20,blocked_until=NULL,window_started_at=clock_timestamp()
 WHERE event_id='43000000-0000-0000-0000-000000000001' AND scope='requests'
 AND subject_hash=encode(sha256(convert_to('42000000-0000-0000-0000-000000000001','UTF8')),'hex');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(public.join_event('a4-one','Too many rejoins','correct-horse',NULL)->>'error_code'='rate_limited','valid rejoin ceiling');
RESET ROLE;
UPDATE public.event_join_attempts SET attempts=0,blocked_until=NULL,window_started_at=clock_timestamp() WHERE scope='requests';
-- Real metadata fixtures for 11 tiny photo registrations; created_at is spoofed
-- intentionally, because rate enforcement must use its own server-side ledger.
INSERT INTO storage.objects(bucket_id,name,metadata)
 SELECT 'photos', g.event_id::text||'/'||g.id::text||'/a4-'||i||'.jpg','{"size":1,"mimetype":"image/jpeg"}'
 FROM public.guests g CROSS JOIN generate_series(1,12) i
 WHERE g.event_id='43000000-0000-0000-0000-000000000001' AND g.user_id='42000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ DECLARE gid uuid:=public.current_event_guest_id('43000000-0000-0000-0000-000000000001'); BEGIN
  FOR i IN 1..10 LOOP
    INSERT INTO public.photos(event_id,guest_id,storage_path,created_at) VALUES(
      '43000000-0000-0000-0000-000000000001',gid,
      '43000000-0000-0000-0000-000000000001/'||gid::text||'/a4-'||i||'.jpg',now()-interval '1 day');
  END LOOP;
  BEGIN
    INSERT INTO public.photos(event_id,guest_id,storage_path) VALUES(
      '43000000-0000-0000-0000-000000000001',gid,'43000000-0000-0000-0000-000000000001/'||gid::text||'/a4-11.jpg');
    RAISE EXCEPTION 'FAIL: eleventh upload allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'alivecap_upload_rate_limited' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*) FROM public.photos)=10,'over-limit photo rolled back');
SELECT pg_temp.assert_true((SELECT storage_used_mb*1048576 FROM public.events WHERE slug='a4-one')=10,'rejected write did not charge quota');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.guest_write_attempts WHERE action='upload')=10,'only successful registrations counted');
-- A second guest gets an independent allowance.
INSERT INTO storage.objects(bucket_id,name,metadata)
 SELECT 'photos',g.event_id::text||'/'||g.id::text||'/independent.jpg','{"size":1,"mimetype":"image/jpeg"}'
 FROM public.guests g WHERE g.event_id='43000000-0000-0000-0000-000000000001' AND g.user_id='42000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','42000000-0000-0000-0000-000000000002',true);
INSERT INTO public.photos(event_id,guest_id,storage_path)
 SELECT '43000000-0000-0000-0000-000000000001',public.current_event_guest_id('43000000-0000-0000-0000-000000000001'),
 '43000000-0000-0000-0000-000000000001/'||public.current_event_guest_id('43000000-0000-0000-0000-000000000001')::text||'/independent.jpg';
SELECT set_config('request.jwt.claim.sub','42000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE pid uuid; gid uuid:=public.current_event_guest_id('43000000-0000-0000-0000-000000000001'); BEGIN
  SELECT id INTO pid FROM public.photos WHERE guest_id=gid LIMIT 1;
  FOR i IN 1..20 LOOP
    INSERT INTO public.comments(photo_id,guest_id,body,created_at) VALUES(pid,gid,'A4 comment',now()-interval '1 day');
  END LOOP;
  BEGIN
    INSERT INTO public.comments(photo_id,guest_id,body) VALUES(pid,gid,'Too many');
    RAISE EXCEPTION 'FAIL: twenty-first comment allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'alivecap_comment_rate_limited' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*) FROM public.comments)=20,'comment burst bounded');
-- Deleting content cannot reset the separate abuse ledger.
DELETE FROM public.comments;
SET LOCAL ROLE authenticated;
DO $$ DECLARE pid uuid; BEGIN
  SELECT id INTO pid FROM public.photos LIMIT 1;
  BEGIN
    INSERT INTO public.comments(photo_id,guest_id,body)
      VALUES(pid,public.current_event_guest_id('43000000-0000-0000-0000-000000000001'),'Delete/repost bypass');
    RAISE EXCEPTION 'FAIL: deletion reset allowance';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'alivecap_comment_rate_limited' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
UPDATE public.guest_write_attempts SET recorded_at=clock_timestamp()-interval '61 seconds';
SET LOCAL ROLE authenticated;
INSERT INTO public.comments(photo_id,guest_id,body)
 SELECT id,public.current_event_guest_id('43000000-0000-0000-0000-000000000001'),'After cooldown' FROM public.photos LIMIT 1;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*) FROM public.comments)=1,'rolling window recovers');
-- Bounded cleanup removes only old bookkeeping, never content or active locks.
UPDATE public.guest_write_attempts SET recorded_at=clock_timestamp()-interval '2 days' WHERE recorded_at<clock_timestamp()-interval '1 minute';
SELECT pg_temp.assert_true(public.prune_abuse_attempts(3)=3,'cleanup batch bounded');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.photos)=11,'cleanup did not delete photos');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.comments)=1,'cleanup did not delete comments');
ROLLBACK;
