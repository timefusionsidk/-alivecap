import test from "node:test";
import assert from "node:assert/strict";
import { storeGuestPhoto } from "../src/lib/guest/upload-photo.server.ts";
import { archiveOwnedEvent } from "../src/lib/admin/archive-event.server.ts";

const session = { event: { id: "event-id" }, guest: { id: "guest-id" } };
function fakeClient({
  uploadError = null,
  registrationError = null,
  throwRegistration = false,
} = {}) {
  const calls = [];
  let saved;
  const bucket = {
    async upload(path, bytes, options) {
      calls.push(["upload", path, bytes.length, options]);
      return { error: uploadError };
    },
    async remove(paths) {
      calls.push(["remove", paths]);
      return { error: null };
    },
  };
  return {
    calls,
    client: {
      storage: {
        from(name) {
          assert.equal(name, "photos");
          return bucket;
        },
      },
      from(name) {
        assert.equal(name, "photos");
        return {
          insert(row) {
            calls.push(["register", row]);
            saved = row;
            return {
              select() {
                return {
                  async single() {
                    if (throwRegistration) throw new Error("Network failure");
                    return {
                      data: registrationError
                        ? null
                        : { id: "photo-id", storage_path: saved.storage_path },
                      error: registrationError,
                    };
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}
test("upload stores an allowlisted image with actual byte count and no upsert", async () => {
  const { client, calls } = fakeClient();
  const result = await storeGuestPhoto(client, session, {
    dataUrl: "data:image/jpeg;base64,YWJj",
    width: 10,
  });
  assert.equal(result.ok, true);
  assert.match(result.photo.storage_path, /^event-id\/guest-id\/[\w-]+\.jpg$/);
  assert.equal(calls[0][2], 3);
  assert.deepEqual(calls[0][3], { contentType: "image/jpeg", upsert: false });
  assert.equal(calls[1][1].size_bytes, 3);
  assert.equal(calls.length, 2);
});
for (const options of [
  { registrationError: { message: "Event storage quota exceeded" } },
  { throwRegistration: true },
]) {
  test(`registration failure removes only the just-uploaded path (${JSON.stringify(options)})`, async () => {
    const { client, calls } = fakeClient(options);
    await assert.rejects(
      storeGuestPhoto(client, session, { dataUrl: "data:image/png;base64,YWJj" }),
    );
    assert.deepEqual(calls[2], ["remove", [calls[0][1]]]);
  });
}
test("Storage failure never registers a row", async () => {
  const { client, calls } = fakeClient({ uploadError: { message: "Too large" } });
  await assert.rejects(
    storeGuestPhoto(client, session, { dataUrl: "data:image/webp;base64,YWJj" }),
    /Too large/,
  );
  assert.equal(calls.length, 1);
});
test("unsupported, invalid and oversized input never reaches Storage", async () => {
  for (const dataUrl of [
    "data:image/svg+xml;base64,YWJj",
    "data:image/png;base64,!!!",
    "data:image/png;base64,",
    "data:image/jpeg;base64," + Buffer.alloc(15 * 1024 * 1024 + 1).toString("base64"),
  ]) {
    const { client, calls } = fakeClient();
    await assert.rejects(storeGuestPhoto(client, session, { dataUrl }));
    assert.equal(calls.length, 0);
  }
});
test("archive uses the owner-checked RPC and propagates rejection", async () => {
  let called;
  assert.deepEqual(
    await archiveOwnedEvent(
      {
        rpc: async (...args) => {
          called = args;
          return { error: null };
        },
      },
      "event-id",
    ),
    { ok: true },
  );
  assert.deepEqual(called, ["archive_owned_event", { _event_id: "event-id" }]);
  await assert.rejects(
    archiveOwnedEvent({ rpc: async () => ({ error: { message: "Event not found" } }) }, "event-id"),
    /Event not found/,
  );
});
