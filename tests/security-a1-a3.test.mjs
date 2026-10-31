import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.mjs";

// Real application migrations and pgcrypto, with platform Auth/Storage fixtures.
test("A1–A3: migration replay and database security regressions", async (t) => {
  const db = await createTestDatabase();
  try {
    t.diagnostic((await db.query("select version() as version")).rows[0].version);
    await db.exec(
      await readFile(new URL("../supabase/tests/a1_a3_security.sql", import.meta.url), "utf8"),
    );
    assert.equal((await db.query("select count(*)::int as n from public.events")).rows[0].n, 0);
  } finally {
    await db.close();
  }
});
