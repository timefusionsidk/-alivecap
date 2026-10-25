import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { requireAuth } from "@/lib/auth/require-auth";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9-]+$/i);
const uuid = z.string().uuid();

/**
 * Gallery reads run as the signed-in guest (an anonymous auth user) so RLS —
 * not a privileged key — decides what is visible.
 */
export const listEventPhotos = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d) =>
    z
      .object({
        slug: slugSchema,
        cursor: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: sessionRes } = await supabase.rpc("my_guest_session", { _slug: data.slug });
    const session = sessionRes as {
      ok: boolean;
      guest?: { id: string; name: string };
      event?: {
        id: string;
        name: string;
        slug: string;
        allow_downloads: boolean;
        allow_comments: boolean;
        allow_likes: boolean;
        theme: Json;
      };
    };
    if (!session?.ok || !session.event || !session.guest) {
      return { ok: false as const, error: "not_found" as const };
    }
    const event = session.event;

    const limit = data.limit ?? 24;
    let q = supabase
      .from("photos")
      .select(
        "id, storage_path, thumbnail_path, width, height, filter_applied, taken_at, guest_id, media_type",
      )
      .eq("event_id", event.id)
      .eq("status", "approved")
      .is("deleted_at", null)
      .order("taken_at", { ascending: false })
      .limit(limit + 1);
    if (data.cursor) q = q.lt("taken_at", data.cursor);

    const { data: rows, error } = await q;
    if (error) throw new Error("Gallery could not load. Please try again.");

    const hasMore = (rows?.length ?? 0) > limit;
    const trimmed = hasMore ? rows!.slice(0, limit) : (rows ?? []);
    const nextCursor = hasMore ? trimmed[trimmed.length - 1].taken_at : null;

    const guestIds = Array.from(
      new Set(trimmed.map((r) => r.guest_id).filter(Boolean)),
    ) as string[];
    const guests = guestIds.length
      ? ((await supabase.from("guests").select("id, name").in("id", guestIds)).data ?? [])
      : [];
    const guestMap = new Map(guests.map((g) => [g.id, g.name]));

    const photoIds = trimmed.map((r) => r.id);
    const likeCounts = new Map<string, number>();
    const commentCounts = new Map<string, number>();
    const liked = new Set<string>();
    if (photoIds.length) {
      const { data: likeRows } = await supabase
        .from("likes")
        .select("photo_id, guest_id")
        .in("photo_id", photoIds);
      likeRows?.forEach((l) => {
        likeCounts.set(l.photo_id, (likeCounts.get(l.photo_id) ?? 0) + 1);
        if (l.guest_id === session.guest!.id) liked.add(l.photo_id);
      });
      const { data: cRows } = await supabase
        .from("comments")
        .select("photo_id")
        .in("photo_id", photoIds)
        .is("deleted_at", null);
      cRows?.forEach((c) =>
        commentCounts.set(c.photo_id, (commentCounts.get(c.photo_id) ?? 0) + 1),
      );
    }

    const photos = trimmed.map((p) => ({
      id: p.id,
      url: null,
      width: p.width,
      height: p.height,
      filter: p.filter_applied,
      media_type: p.media_type,
      taken_at: p.taken_at,
      guest_name: p.guest_id ? (guestMap.get(p.guest_id) ?? null) : null,
      likes: likeCounts.get(p.id) ?? 0,
      comments: commentCounts.get(p.id) ?? 0,
      liked_by_me: liked.has(p.id),
    }));

    return {
      ok: true as const,
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        allow_downloads: event.allow_downloads,
        allow_comments: event.allow_comments,
        allow_likes: event.allow_likes,
        theme: event.theme,
      },
      photos,
      nextCursor,
    };
  });

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ photoId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: photo } = await supabase
      .from("photos")
      .select("id, event_id, status, deleted_at")
      .eq("id", data.photoId)
      .maybeSingle();
    if (!photo || photo.deleted_at || photo.status !== "approved")
      throw new Error("Photo not available");

    const { data: guestId } = await supabase.rpc("current_event_guest_id", {
      _event_id: photo.event_id,
    });
    if (!guestId) throw new Error("Unauthorized");

    const { data: existing } = await supabase
      .from("likes")
      .select("id")
      .eq("photo_id", data.photoId)
      .eq("guest_id", guestId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("likes").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ok: true as const, liked: false };
    }
    const { error } = await supabase
      .from("likes")
      .insert({ photo_id: data.photoId, guest_id: guestId });
    if (error) throw new Error(error.message);
    return { ok: true as const, liked: true };
  });

export const listComments = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ photoId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: rows } = await supabase
      .from("comments")
      .select("id, body, created_at, guest_id")
      .eq("photo_id", data.photoId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(200);
    const ids = Array.from(
      new Set((rows ?? []).map((r) => r.guest_id).filter(Boolean)),
    ) as string[];
    const guests = ids.length
      ? ((await supabase.from("guests").select("id, name").in("id", ids)).data ?? [])
      : [];
    const map = new Map(guests.map((g) => [g.id, g.name]));
    return {
      ok: true as const,
      comments: (rows ?? []).map((r) => ({
        id: r.id,
        body: r.body,
        created_at: r.created_at,
        author: r.guest_id ? (map.get(r.guest_id) ?? "Guest") : "Guest",
      })),
    };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) =>
    z.object({ photoId: uuid, body: z.string().trim().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: photo } = await supabase
      .from("photos")
      .select("id, event_id, status, deleted_at")
      .eq("id", data.photoId)
      .maybeSingle();
    if (!photo || photo.deleted_at || photo.status !== "approved")
      throw new Error("Photo not available");

    const { data: guestId } = await supabase.rpc("current_event_guest_id", {
      _event_id: photo.event_id,
    });
    if (!guestId) throw new Error("Unauthorized");

    const { data: row, error } = await supabase
      .from("comments")
      .insert({ photo_id: data.photoId, guest_id: guestId, body: data.body })
      .select("id, body, created_at")
      .single();
    if (error || !row) throw new Error("Comments are not available right now");
    return { ok: true as const, comment: row };
  });

/** POST prevents intermediary GET caching; RLS is checked before every byte read. */
export const readGuestPhoto = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) =>
    z.object({ photoId: uuid, thumbnail: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: photo } = await context.supabase
      .from("photos")
      .select("id, event_id, storage_path, thumbnail_path, status, deleted_at")
      .eq("id", data.photoId)
      .eq("status", "approved")
      .is("deleted_at", null)
      .maybeSingle();
    if (!photo)
      return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const { data: guest } = await context.supabase.rpc("current_event_guest_id", {
      _event_id: photo.event_id,
    });
    if (!guest)
      return new Response(null, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    const thumbnail = data.thumbnail && photo.thumbnail_path;
    const { data: blob, error } = await context.supabase.storage
      .from(thumbnail ? "thumbnails" : "photos")
      .download(thumbnail || photo.storage_path);
    if (error || !blob)
      return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    return new Response(blob.stream(), {
      headers: {
        "Content-Type": blob.type || "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
