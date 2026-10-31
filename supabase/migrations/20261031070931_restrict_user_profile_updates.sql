-- A1: RLS scopes rows; column privileges scope writable profile fields.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.users FROM PUBLIC, anon, authenticated;
-- Clear any old column grants too (revoking a table grant does not clear them).
DO $$ DECLARE cols text; BEGIN
  SELECT string_agg(quote_ident(attname), ', ') INTO cols
  FROM pg_attribute WHERE attrelid = 'public.users'::regclass
    AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE UPDATE (%s), INSERT (%s) ON public.users FROM PUBLIC, anon, authenticated', cols, cols);
END $$;
GRANT UPDATE (full_name, avatar_url) ON public.users TO authenticated;

-- ROLLBACK (restores the previous insecure write surface; coordinate with code):
-- REVOKE UPDATE (full_name, avatar_url) ON public.users FROM authenticated;
-- GRANT INSERT, UPDATE, DELETE ON public.users TO authenticated;
-- The target project's default anon/table TRUNCATE/REFERENCES/TRIGGER grants are
-- intentionally not restored: they are unnecessary and TRUNCATE bypasses RLS.
