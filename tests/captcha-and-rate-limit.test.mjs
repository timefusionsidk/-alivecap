import test from "node:test";
import assert from "node:assert/strict";
import { parseCaptchaConfig } from "../src/lib/auth/captcha-config.ts";
import { ensureAnonymousSession } from "../src/lib/auth/anonymous-session.ts";
import { loadCaptcha, isCaptchaReady } from "../src/lib/auth/captcha-client.ts";
import { boundedRetrySeconds, guestWriteRateLimitMessage } from "../src/lib/guest/rate-limit.ts";

function authFixture({ existing = null, authError = null, sessionError = null } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      async getSession() {
        return {
          data: { session: existing ? { user: { id: existing } } : null },
          error: sessionError,
        };
      },
      async signInAnonymously(options) {
        calls.push(options);
        return {
          data: { session: authError ? null : { user: { id: "new-guest" } } },
          error: authError,
        };
      },
    },
  };
}
test("CAPTCHA configuration is optional only when both settings are absent", () => {
  assert.deepEqual(parseCaptchaConfig(), { enabled: false });
  for (const [provider, key] of [
    ["turnstile", undefined],
    [undefined, "key"],
    ["recaptcha", "key"],
  ]) {
    const config = parseCaptchaConfig(provider, key);
    assert.equal(config.enabled, true);
    assert.ok(config.error);
    assert.equal(isCaptchaReady(config, "fabricated-token"), false);
  }
  for (const provider of ["turnstile", "hcaptcha"]) {
    const config = parseCaptchaConfig(provider, "public-site-key");
    assert.equal(isCaptchaReady(config, null), false);
    assert.equal(isCaptchaReady(config, "token"), true);
  }
});
test("anonymous sign-in forwards the token to Supabase Auth options", async () => {
  const { auth, calls } = authFixture();
  assert.equal(await ensureAnonymousSession(auth, "captcha-token", true), "new-guest");
  assert.deepEqual(calls, [{ options: { captchaToken: "captcha-token" } }]);
});
test("existing guest or host sessions are reused without another CAPTCHA", async () => {
  for (const existing of ["host-id", "guest-id"]) {
    const { auth, calls } = authFixture({ existing });
    assert.equal(await ensureAnonymousSession(auth, null, true), existing);
    assert.equal(calls.length, 0);
  }
});
test("missing required tokens and session restoration failures never create a new identity", async () => {
  const { auth, calls } = authFixture();
  await assert.rejects(ensureAnonymousSession(auth, null, true), /Complete the verification/);
  assert.equal(calls.length, 0);
  const restore = authFixture({ sessionError: { message: "Untrusted backend text" } });
  await assert.rejects(ensureAnonymousSession(restore.auth, "token", true), /Could not restore/);
  assert.equal(restore.calls.length, 0);
});
test("rejected CAPTCHA tokens surface safe copy and are not retried automatically", async () => {
  const { auth, calls } = authFixture({
    authError: { code: "captcha_failed", message: "Raw provider details" },
  });
  await assert.rejects(
    ensureAnonymousSession(auth, "expired-token", true),
    /Verification expired or was rejected/,
  );
  assert.equal(calls.length, 1);
});
test("Supabase anonymous-identity rate rejection gets safe retry copy", async () => {
  const { auth } = authFixture({
    authError: { code: "over_anonymous_users_rate_limit", message: "Raw details" },
  });
  await assert.rejects(ensureAnonymousSession(auth, "token", true), /wait a minute/);
});
test("deployments with CAPTCHA disabled retain anonymous sign-in", async () => {
  const { auth, calls } = authFixture();
  await ensureAnonymousSession(auth);
  assert.deepEqual(calls, [undefined]);
});
test("only exact trusted limiter errors get rate-limit copy", () => {
  assert.match(
    guestWriteRateLimitMessage(
      { code: "P0001", message: "alivecap_upload_rate_limited" },
      "upload",
    ),
    /wait a minute/,
  );
  assert.match(
    guestWriteRateLimitMessage(
      { code: "P0001", message: "alivecap_comment_rate_limited" },
      "comment",
    ),
    /comments/,
  );
  assert.equal(
    guestWriteRateLimitMessage(
      { code: "42501", message: "alivecap_upload_rate_limited" },
      "upload",
    ),
    null,
  );
  assert.equal(
    guestWriteRateLimitMessage({ code: "P0001", message: "Driver failure" }, "comment"),
    null,
  );
  assert.equal(guestWriteRateLimitMessage(null, "upload"), null);
  assert.equal(boundedRetrySeconds(999999), 900);
  assert.equal(boundedRetrySeconds(-10), 1);
  assert.equal(boundedRetrySeconds(Number.NaN), 60);
  assert.equal(boundedRetrySeconds("10"), 60);
});
test("CAPTCHA loader deduplicates requests, uses official URLs and retries failures", async () => {
  const scripts = [];
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  globalThis.window = {};
  globalThis.document = {
    createElement() {
      return {
        remove() {
          this.removed = true;
        },
      };
    },
    head: {
      appendChild(script) {
        scripts.push(script);
      },
    },
  };
  try {
    const first = loadCaptcha("turnstile");
    assert.equal(loadCaptcha("turnstile"), first);
    assert.equal(scripts.length, 1);
    assert.match(
      scripts[0].src,
      /^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?/,
    );
    scripts[0].onerror();
    await assert.rejects(first, /could not load/);
    assert.equal(scripts[0].removed, true);
    const retry = loadCaptcha("turnstile");
    assert.equal(scripts.length, 2);
    const api = { render() {}, remove() {} };
    window.turnstile = api;
    window.alivecapTurnstileReady();
    assert.equal(await retry, api);
    const hcaptcha = loadCaptcha("hcaptcha");
    assert.match(scripts[2].src, /^https:\/\/js\.hcaptcha\.com\/1\/api\.js\?/);
    window.hcaptcha = api;
    window.alivecapHcaptchaReady();
    assert.equal(await hcaptcha, api);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});
