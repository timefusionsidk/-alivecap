import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTestDatabase } from "./helpers/database.mjs";

test("A4 database abuse controls and executable rollback", async (t) => {
  const db = await createTestDatabase();
  try {
    await db.exec(
      await readFile(new URL("../supabase/tests/a4_abuse_controls.sql", import.meta.url), "utf8"),
    );
    const migration = await readFile(
      new URL("../supabase/migrations/20261031084117_guest_abuse_controls.sql", import.meta.url),
      "utf8",
    );
    const rollback = migration.match(/\/\* ROLLBACK SQL[^\n]*\n([\s\S]*?)\*\//)[1];
    await db.exec(rollback);
    assert.equal(
      (await db.query("select to_regclass('public.event_join_attempts') as name")).rows[0].name,
      null,
    );
    assert.equal(
      (
        await db.query(
          "select has_function_privilege('authenticated','public.join_event(text,text,text,text)','EXECUTE') as allowed",
        )
      ).rows[0].allowed,
      true,
    );
    await db.exec(
      await readFile(new URL("../supabase/tests/a1_a3_security.sql", import.meta.url), "utf8"),
    );
    t.diagnostic("Rollback restored the A3 join function and passed the A1–A3 regression suite.");
  } finally {
    await db.close();
  }
});
