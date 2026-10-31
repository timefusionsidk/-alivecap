-- A4. Private counters remain in public for migration consistency; RLS plus
-- revoked privileges keep them out of every client Data API operation.
CREATE TABLE public.event_join_attempts (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('slug', 'user', 'device', 'requests')),
  subject_hash text NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  failure_times timestamptz[] NOT NULL DEFAULT '{}' CHECK (cardinality(failure_times)<=5),
  window_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (event_id, scope, subject_hash)
);
ALTER TABLE public.event_join_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_join_attempts FROM PUBLIC, anon, authenticated;
CREATE INDEX event_join_attempts_cleanup_idx ON public.event_join_attempts(updated_at);

-- Preserve all A3 admission/ownership logic, but remove its direct API surface.
ALTER FUNCTION public.join_event(text,text,text,text) RENAME TO join_event_core_a4;
REVOKE ALL ON FUNCTION public.join_event_core_a4(text,text,text,text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.join_event(
  _slug text, _name text, _password text DEFAULT NULL, _device_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  e public.events;
  stamp timestamptz := clock_timestamp();
  user_hash text;
  device_hash text;
  slug_hash text;
  wait_seconds integer;
  result jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Your session expired. Please try again.');
  END IF;
  IF _slug IS NULL OR _slug !~ '^[a-zA-Z0-9-]{1,100}$'
    OR length(btrim(coalesce(_name,''))) NOT BETWEEN 1 AND 80
    OR length(coalesce(_password,'')) > 200
    OR (_device_id IS NOT NULL AND _device_id !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid guest details');
  END IF;
  -- Same event-row lock as A3; all counters and password checks serialize.
  SELECT * INTO e FROM public.events WHERE slug = _slug AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','Event not found'); END IF;
  -- Re-read after potentially waiting for another request's row lock.
  stamp := clock_timestamp();
  IF e.status = 'archived' OR (e.expires_at IS NOT NULL AND e.expires_at <= stamp) THEN
    RETURN jsonb_build_object('ok',false,'error','This event is closed');
  END IF;
  user_hash := encode(sha256(convert_to(uid::text,'UTF8')),'hex');
  device_hash := CASE WHEN _device_id IS NULL THEN NULL
    ELSE encode(sha256(convert_to(lower(_device_id),'UTF8')),'hex') END;
  slug_hash := encode(sha256(convert_to(e.slug,'UTF8')),'hex');

  -- Already-blocked identities must not spend the event-wide budget or create
  -- new device rows. A separate user request budget also bounds valid rejoins.
  SELECT greatest(0,ceil(extract(epoch FROM max(blocked_until)-stamp)))::integer INTO wait_seconds
    FROM public.event_join_attempts WHERE event_id=e.id
      AND (((scope='user' OR scope='requests') AND subject_hash=user_hash)
        OR (scope='device' AND subject_hash=device_hash));
  IF coalesce(wait_seconds,0) > 0 THEN
    RETURN jsonb_build_object('ok',false,'error','Too many join attempts. Please wait and try again.',
      'error_code','rate_limited','retry_after_seconds',wait_seconds);
  END IF;
  INSERT INTO public.event_join_attempts(event_id,scope,subject_hash,window_started_at,updated_at)
    VALUES(e.id,'requests',user_hash,stamp,stamp) ON CONFLICT DO NOTHING;
  UPDATE public.event_join_attempts SET attempts=0,window_started_at=stamp,blocked_until=NULL,updated_at=stamp
    WHERE event_id=e.id AND scope='requests' AND subject_hash=user_hash
      AND window_started_at<=stamp-interval '1 minute' AND coalesce(blocked_until,stamp)<=stamp;
  UPDATE public.event_join_attempts SET blocked_until=stamp+interval '1 minute',updated_at=stamp
    WHERE event_id=e.id AND scope='requests' AND subject_hash=user_hash AND attempts>=20 AND blocked_until IS NULL;
  SELECT greatest(0,ceil(extract(epoch FROM blocked_until-stamp)))::integer INTO wait_seconds
    FROM public.event_join_attempts WHERE event_id=e.id AND scope='requests' AND subject_hash=user_hash;
  IF coalesce(wait_seconds,0)>0 THEN
    RETURN jsonb_build_object('ok',false,'error','Too many join attempts. Please wait and try again.',
      'error_code','rate_limited','retry_after_seconds',wait_seconds);
  END IF;
  UPDATE public.event_join_attempts SET attempts=attempts+1,updated_at=stamp
    WHERE event_id=e.id AND scope='requests' AND subject_hash=user_hash;

  INSERT INTO public.event_join_attempts(event_id,scope,subject_hash,window_started_at,updated_at)
    VALUES(e.id,'slug',slug_hash,stamp,stamp) ON CONFLICT DO NOTHING;
  UPDATE public.event_join_attempts SET attempts=0, window_started_at=stamp, blocked_until=NULL, updated_at=stamp
    WHERE event_id=e.id AND scope='slug' AND subject_hash=slug_hash
      AND window_started_at <= stamp-interval '1 minute'
      AND coalesce(blocked_until,stamp) <= stamp;
  UPDATE public.event_join_attempts SET blocked_until=stamp+interval '1 minute', updated_at=stamp
    WHERE event_id=e.id AND scope='slug' AND subject_hash=slug_hash AND attempts>=120
      AND blocked_until IS NULL;
  SELECT greatest(0,ceil(extract(epoch FROM blocked_until-stamp)))::integer INTO wait_seconds
    FROM public.event_join_attempts WHERE event_id=e.id AND scope='slug' AND subject_hash=slug_hash;
  IF coalesce(wait_seconds,0) > 0 THEN
    RETURN jsonb_build_object('ok',false,'error','Too many join attempts. Please wait and try again.',
      'error_code','rate_limited','retry_after_seconds',wait_seconds);
  END IF;
  UPDATE public.event_join_attempts SET attempts=attempts+1,updated_at=stamp
    WHERE event_id=e.id AND scope='slug' AND subject_hash=slug_hash;

  INSERT INTO public.event_join_attempts(event_id,scope,subject_hash,window_started_at,updated_at)
    VALUES(e.id,'user',user_hash,stamp,stamp) ON CONFLICT DO NOTHING;
  IF device_hash IS NOT NULL THEN
    INSERT INTO public.event_join_attempts(event_id,scope,subject_hash,window_started_at,updated_at)
      VALUES(e.id,'device',device_hash,stamp,stamp) ON CONFLICT DO NOTHING;
  END IF;
  -- A bounded rolling failure history avoids a counter-window boundary burst.
  -- Active blocks were returned above; at most five timestamps are retained.
  UPDATE public.event_join_attempts a SET failure_times=recent.times,
    attempts=cardinality(recent.times), window_started_at=coalesce((recent.times)[1],stamp),
    blocked_until=CASE WHEN a.blocked_until<=stamp THEN NULL ELSE a.blocked_until END,
    updated_at=stamp
  FROM (
    SELECT event_id,scope,subject_hash,
      ARRAY(SELECT ts FROM unnest(failure_times) ts WHERE ts>stamp-interval '15 minutes') AS times
    FROM public.event_join_attempts
    WHERE event_id=e.id AND ((scope='user' AND subject_hash=user_hash) OR (scope='device' AND subject_hash=device_hash))
  ) recent
  WHERE a.event_id=recent.event_id AND a.scope=recent.scope AND a.subject_hash=recent.subject_hash;
  SELECT greatest(0,ceil(extract(epoch FROM max(blocked_until)-stamp)))::integer INTO wait_seconds
    FROM public.event_join_attempts WHERE event_id=e.id
      AND ((scope='user' AND subject_hash=user_hash) OR (scope='device' AND subject_hash=device_hash));
  IF coalesce(wait_seconds,0) > 0 THEN
    RETURN jsonb_build_object('ok',false,'error','Too many join attempts. Please wait and try again.',
      'error_code','rate_limited','retry_after_seconds',wait_seconds);
  END IF;

  result := public.join_event_core_a4(_slug,_name,_password,_device_id);
  IF result->>'ok' = 'false' AND result->>'error' = 'Incorrect password' THEN
    UPDATE public.event_join_attempts SET attempts=attempts+1,updated_at=stamp,
      failure_times=array_append(failure_times,stamp),
      blocked_until=CASE WHEN attempts+1>=5 THEN stamp+interval '15 minutes' ELSE NULL END
      WHERE event_id=e.id AND ((scope='user' AND subject_hash=user_hash) OR (scope='device' AND subject_hash=device_hash));
    IF EXISTS(SELECT 1 FROM public.event_join_attempts WHERE event_id=e.id AND blocked_until>stamp
      AND ((scope='user' AND subject_hash=user_hash) OR (scope='device' AND subject_hash=device_hash))) THEN
      RETURN jsonb_build_object('ok',false,'error','Too many join attempts. Please wait and try again.',
        'error_code','rate_limited','retry_after_seconds',900);
    END IF;
  END IF;
  -- Failure counters intentionally survive successful joins until window expiry.
  -- Returning JSON (rather than raising) makes wrong-password counters commit.
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.join_event(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_event(text,text,text,text) TO authenticated;

CREATE TABLE public.guest_write_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('upload','comment')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.guest_write_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_write_attempts FROM PUBLIC, anon, authenticated;
CREATE INDEX guest_write_attempts_window_idx ON public.guest_write_attempts(guest_id,action,recorded_at DESC);
CREATE INDEX guest_write_attempts_cleanup_idx ON public.guest_write_attempts(recorded_at);

CREATE FUNCTION public.limit_guest_writes()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  kind text;
  cap integer;
  target_event uuid;
  stamp timestamptz;
BEGIN
  -- Host-only rows with no guest identity aren't part of a guest's allowance.
  -- Existing RLS still decides whether such inserts are authorized.
  IF NEW.guest_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'photos' THEN
    kind := 'upload'; cap := 10; target_event := NEW.event_id;
  ELSE
    kind := 'comment'; cap := 20;
    SELECT event_id INTO target_event FROM public.photos WHERE id=NEW.photo_id;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.guests g WHERE g.id=NEW.guest_id AND g.event_id=target_event) THEN
    RAISE EXCEPTION 'Invalid event guest' USING ERRCODE='23514';
  END IF;
  -- AFTER INSERT: photos already hold A3's event lock. A guest advisory lock
  -- serializes successful-write accounting without reversing event/guest locks.
  PERFORM pg_advisory_xact_lock(hashtextextended('alivecap-guest-writes:'||NEW.guest_id::text,0));
  stamp := clock_timestamp();
  IF (SELECT count(*) FROM public.guest_write_attempts
      WHERE guest_id=NEW.guest_id AND action=kind AND recorded_at>stamp-interval '1 minute') >= cap THEN
    RAISE EXCEPTION '%', 'alivecap_'||kind||'_rate_limited' USING ERRCODE='P0001';
  END IF;
  INSERT INTO public.guest_write_attempts(guest_id,action,recorded_at) VALUES(NEW.guest_id,kind,stamp);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.limit_guest_writes() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER photos_guest_rate_limit AFTER INSERT ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.limit_guest_writes();
CREATE TRIGGER comments_guest_rate_limit AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.limit_guest_writes();

-- Bounded maintenance hook for a trusted scheduler/DB operator, never a client.
CREATE FUNCTION public.prune_abuse_attempts(_batch_size integer DEFAULT 5000)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; m integer;
BEGIN
  IF _batch_size NOT BETWEEN 1 AND 10000 OR _batch_size IS NULL THEN
    RAISE EXCEPTION 'Batch size must be between 1 and 10000' USING ERRCODE='22023';
  END IF;
  WITH expired AS (SELECT ctid FROM public.event_join_attempts
    WHERE updated_at<clock_timestamp()-interval '1 day'
      AND coalesce(blocked_until,'-infinity'::timestamptz)<clock_timestamp()
    ORDER BY updated_at LIMIT _batch_size FOR UPDATE SKIP LOCKED)
  DELETE FROM public.event_join_attempts WHERE ctid IN (SELECT ctid FROM expired);
  GET DIAGNOSTICS n=ROW_COUNT;
  WITH expired AS (SELECT id FROM public.guest_write_attempts
    WHERE recorded_at<clock_timestamp()-interval '1 day'
    ORDER BY recorded_at LIMIT _batch_size FOR UPDATE SKIP LOCKED)
  DELETE FROM public.guest_write_attempts WHERE id IN (SELECT id FROM expired);
  GET DIAGNOSTICS m=ROW_COUNT;
  RETURN n+m;
END $$;
REVOKE ALL ON FUNCTION public.prune_abuse_attempts(integer) FROM PUBLIC, anon, authenticated;

/* ROLLBACK SQL (discards counter history; deploy matching client behavior):
DROP TRIGGER comments_guest_rate_limit ON public.comments;
DROP TRIGGER photos_guest_rate_limit ON public.photos;
DROP FUNCTION public.limit_guest_writes();
DROP FUNCTION public.prune_abuse_attempts(integer);
DROP TABLE public.guest_write_attempts;
DROP FUNCTION public.join_event(text,text,text,text);
ALTER FUNCTION public.join_event_core_a4(text,text,text,text) RENAME TO join_event;
REVOKE ALL ON FUNCTION public.join_event(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_event(text,text,text,text) TO authenticated;
DROP TABLE public.event_join_attempts;
*/
