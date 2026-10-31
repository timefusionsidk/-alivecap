import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { requireAuth } from "@/lib/auth/require-auth";
import { createPublicSupabase } from "@/lib/supabase-public";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9-]+$/i, "Invalid event code");

type ThemeJson = Json;

type GuestSession = {
  ok: boolean;
  error?: string;
  guest?: { id: string; name: string };
  event?: {
    id: string;
    name: string;
    slug: string;
    allow_uploads: boolean;
    allow_downloads: boolean;
    allow_comments: boolean;
    allow_likes: boolean;
    cover_image_url: string | null;
    theme: ThemeJson;
  };
};

/** Public pre-join info. Reads only safe columns through a database function. */
export const getEventPreview = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: slugSchema }).parse(d))
  .handler(async ({ data }) => {
    const supabase = createPublicSupabase();
    const { data: rows } = await supabase.rpc("event_public_info", { _slug: data.slug });
    const event = Array.isArray(rows) ? rows[0] : null;
    if (!event) return { ok: false as const, error: "not_found" as const };
    if (event.status === "archived") return { ok: false as const, error: "closed" as const };
    if (event.expires_at && new Date(event.expires_at) < new Date()) {
      return { ok: false as const, error: "ended" as const };
    }
    return {
      ok: true as const,
      event: {
        id: event.id,
        name: event.name,
        description: event.description,
        cover_image_url: event.cover_image_url,
        has_password: event.has_password,
        theme: event.theme,
        allow_uploads: event.allow_uploads,
      },
    };
  });

/**
 * Joins the event as the current (anonymous) auth user. The password check and the
 * guest upsert both happen inside the database, so no privileged key is needed.
 */
export const joinEvent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) =>
    z
      .object({
        slug: slugSchema,
        name: z.string().trim().min(1, "Enter your name").max(80),
        password: z.string().max(200).optional(),
        deviceId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("join_event", {
      _slug: data.slug,
      _name: data.name,
      _password: data.password ?? undefined,
      _device_id: data.deviceId ?? undefined,
    });
    if (error) return { ok: false as const, error: "Could not join this event. Please try again." };
    const payload = res as GuestSession;
    if (!payload?.ok) {
      return { ok: false as const, error: payload?.error ?? "Could not join this event." };
    }
    return { ok: true as const, guest: payload.guest!, event: payload.event! };
  });

/** The signed-in guest's own session (guest + event), or `{ ok: false }`. */
export const getCurrentGuest = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ slug: slugSchema.optional() }).optional().parse(d))
  .handler(async ({ data, context }) => {
    const { data: res } = await context.supabase.rpc("my_guest_session", {
      _slug: data?.slug ?? undefined,
    });
    const payload = res as GuestSession;
    if (!payload?.ok) return { ok: false as const };
    return { ok: true as const, guest: payload.guest!, event: payload.event! };
  });

export const uploadGuestPhoto = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) =>
    z
      .object({
        slug: slugSchema,
        dataUrl: z.string().startsWith("data:image/").max(20_000_000, "Photo too large"),
        filter: z.string().max(40).optional(),
        width: z.number().int().positive().max(10_000).optional(),
        height: z.number().int().positive().max(10_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: sessionRes } = await context.supabase.rpc("my_guest_session", {
      _slug: data.slug,
    });
    const session = sessionRes as GuestSession;
    if (!session?.ok || !session.guest || !session.event) throw new Error("Unauthorized");
    if (!session.event.allow_uploads) throw new Error("Uploads are disabled");

    const { storeGuestPhoto } = await import("./upload-photo.server");
    return storeGuestPhoto(context.supabase, { event: session.event, guest: session.guest }, data);
  });
