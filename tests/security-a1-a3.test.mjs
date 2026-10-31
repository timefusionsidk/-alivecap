import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Actual application migrations, with lightweight stand-ins for platform-owned
// Auth/Storage schemas. Storage HTTP, signed JWTs and Realtime need staging QA.
test("A1–A3: migration replay and database security regressions", async (t) => {
  const db = new PGlite();
  t.diagnostic((await db.query("select version() as version")).rows[0].version);
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
      CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false,
        file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        bucket_id text REFERENCES storage.buckets(id), name text, metadata jsonb,
        UNIQUE(bucket_id,name));
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
        SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
      GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth,storage TO anon,authenticated;
      -- Match the target project's inherited default table grants as well as
      -- the explicit grants in historical migrations.
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
      CREATE PUBLICATION supabase_realtime;
    `);
    for (const file of (
      await readdir(new URL("../supabase/migrations/", import.meta.url))
    ).sort()) {
      if (!file.endsWith(".sql")) continue;
      const sql = await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      );
      // PGlite does not bundle pgcrypto. Tests use passwordless events; all other
      // application migration SQL, grants, functions and RLS run unchanged.
      await db.exec(sql.replace(/create extension if not exists pgcrypto;/i, ""));
    }
    const sql = await readFile(
      new URL("../supabase/tests/a1_a3_security.sql", import.meta.url),
      "utf8",
    );
    await db.exec(sql);
    assert.equal((await db.query("select count(*)::int as n from public.events")).rows[0].n, 0);
    await t.test("all SQL assertions passed; fixtures rolled back", () => {});
  } finally {
    await db.close();
  }
});
