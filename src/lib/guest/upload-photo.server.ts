import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../integrations/supabase/types";

const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

type UploadInput = {
  dataUrl: string;
  filter?: string;
  width?: number;
  height?: number;
};

/** Transitional A3 upload. A6 replaces the server data URL transport. */
export async function storeGuestPhoto(
  client: SupabaseClient<Database>,
  session: { event: { id: string }; guest: { id: string } },
  input: UploadInput,
) {
  const match = input.dataUrl.match(/^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) throw new Error("Invalid image data");
  const contentType = match[1].toLowerCase();
  const ext = imageExtensions[contentType];
  if (!ext) throw new Error("Unsupported image type");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > 15 * 1024 * 1024) {
    throw new Error("Photo must be between 1 byte and 15 MiB");
  }
  const path = `${session.event.id}/${session.guest.id}/${crypto.randomUUID()}.${ext}`;
  const bucket = client.storage.from("photos");
  const { error: uploadError } = await bucket.upload(path, bytes, { contentType, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  try {
    const { data: photo, error } = await client
      .from("photos")
      .insert({
        event_id: session.event.id,
        guest_id: session.guest.id,
        storage_path: path,
        media_type: "photo",
        filter_applied: input.filter ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        size_bytes: bytes.length, // DB derives the authoritative size from Storage.
        status: "approved",
      })
      .select("id, storage_path")
      .single();
    if (error || !photo) throw new Error(error?.message ?? "Could not register photo");
    return { ok: true as const, photo };
  } catch (error) {
    // A quota rejection must not leave the normal camera flow's bytes behind.
    // RLS permits removing only this guest's unregistered object. If the row
    // committed despite a network error, RLS protects its registered object.
    try {
      const { error: cleanupError } = await bucket.remove([path]);
      if (cleanupError)
        console.error("[alivecap]", { action: "upload_cleanup_failed", code: cleanupError.name });
    } catch {
      console.error("[alivecap]", { action: "upload_cleanup_failed", code: "network_error" });
    }
    throw error;
  }
}
