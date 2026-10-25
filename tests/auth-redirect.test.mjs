import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeRedirect } from "../src/lib/auth/redirect.ts";
test("preserves event deep links", () => {
  assert.equal(sanitizeRedirect("/events/abc/settings"), "/events/abc/settings");
});
test("rejects external, protocol-relative, backslash and control-character redirects", () => {
  for (const value of [
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/\n/example.com",
    "",
    null,
    "/auth/login",
  ])
    assert.equal(sanitizeRedirect(value), "/dashboard");
});
