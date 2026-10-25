import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/require-auth";
import { z } from "zod";

const uuid = z.string().uuid();

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s-]+/gu, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
function randSuffix(len = 5) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  const arr = crypto.getRandomValues(new Uint8Array(len));
  for (const n of arr) s += chars[n % chars.length];
  return s;
}

type HostClient = {
  storage: {
    from: (b: string) => {
      createSignedUrl: (p: string, s: number) => Promise<{ data: { signedUrl: string } | null }>;
    };
  };
};

/** Signs a photo URL as the host: RLS on storage grants access to their own events only. */
async function signedPhotoUrl(client: HostClient, path: string, seconds = 3600) {
  const { data } = await client.storage.from("photos").createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

async function eventThumbnails(
  client: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >,
  id: string,
): Promise<string[]> {
  const { data } = await client
    .from("photos")
    .select("storage_path")
    .eq("event_id", id)
    .is("deleted_at", null)
    .eq("status", "approved")
    .order("taken_at", { ascending: false })
    .limit(6);
  return (
    await Promise.all(
      (data ?? []).map((p: { storage_path: string }) => signedPhotoUrl(client, p.storage_path)),
    )
  ).filter((url): url is string => !!url);
}

// ---- Event list ----
export const listMyEvents = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    if (context.claims.is_anonymous) throw new Error("Host sign-in required");
    const { data: events, error } = await context.supabase
      .from("events")
      .select(
        "id, slug, name, description, venue, cover_image_url, status, event_date, expires_at, allow_uploads, allow_downloads, storage_used_mb, storage_limit_mb, created_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Aggregated in Postgres (owner-scoped SECURITY DEFINER fn) instead of
    // pulling every photo/guest row back to the server just to count them.
    const { data: statRows, error: statErr } = await context.supabase.rpc("host_event_stats");
    if (statErr) throw new Error(statErr.message);
    const stats = new Map(
      (statRows ?? []).map((r) => [
        r.event_id,
        {
          photos: Number(r.photo_count ?? 0),
          guests: Number(r.guest_count ?? 0),
          last: r.last_photo_at,
        },
      ]),
    );

    return {
      events: await Promise.all(
        (events ?? []).map(async (e) => ({
          ...e,
          photo_count: stats.get(e.id)?.photos ?? 0,
          guest_count: stats.get(e.id)?.guests ?? 0,
          last_photo_at: stats.get(e.id)?.last ?? null,
          thumbnails: await eventThumbnails(context.supabase, e.id),
        })),
      ),
    };
  });

// ---- Host overview (dashboard command center) ----
export const getHostOverview = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    if (context.claims.is_anonymous) throw new Error("Host sign-in required");
    const [{ data: profile }, { data: statRows, error: statErr }, { data: events, error: evErr }] =
      await Promise.all([
        context.supabase
          .from("users")
          .select("full_name, email, plan, created_at")
          .eq("id", context.userId)
          .maybeSingle(),
        context.supabase.rpc("host_event_stats"),
        context.supabase
          .from("events")
          .select("id, name, slug, status, storage_used_mb, storage_limit_mb")
          .is("deleted_at", null),
      ]);
    if (statErr) throw new Error(statErr.message);
    if (evErr) throw new Error(evErr.message);

    const rows = statRows ?? [];
    const list = events ?? [];
    const totals = {
      events: list.length,
      active_events: list.filter((e) => e.status === "active").length,
      photos: rows.reduce((n, r) => n + Number(r.photo_count ?? 0), 0),
      guests: rows.reduce((n, r) => n + Number(r.guest_count ?? 0), 0),
      storage_used_mb:
        Math.round(list.reduce((n, e) => n + Number(e.storage_used_mb ?? 0), 0) * 10) / 10,
      storage_limit_mb: list.reduce((n, e) => n + Number(e.storage_limit_mb ?? 0), 0),
    };

    const lastActivityAt =
      rows
        .map((r) => r.last_photo_at)
        .filter((v): v is string => !!v)
        .sort()
        .pop() ?? null;

    const byId = new Map(list.map((e) => [e.id, e]));
    const activity = rows
      .filter((r) => !!r.last_photo_at)
      .sort((a, b) => (a.last_photo_at! < b.last_photo_at! ? 1 : -1))
      .slice(0, 5)
      .map((r) => ({
        event_id: r.event_id,
        event_name: byId.get(r.event_id)?.name ?? "Event",
        photos: Number(r.photo_count ?? 0),
        guests: Number(r.guest_count ?? 0),
        at: r.last_photo_at!,
      }));

    return {
      ok: true as const,
      account: {
        name: profile?.full_name ?? null,
        email: profile?.email ?? null,
        plan: profile?.plan ?? "free",
        member_since: profile?.created_at ?? null,
      },
      totals,
      lastActivityAt,
      activity,
    };
  });

// ---- Create event ----
export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d) =>
    z
      .object({
        name: z.string().trim().min(1, "Name is required").max(120),
        description: z.string().trim().max(1000).optional(),
        venue: z.string().trim().max(200).optional(),
        event_date: z.string().date().optional(),
        password: z.string().min(4).max(200).optional(),
        allow_uploads: z.boolean().default(true),
        allow_downloads: z.boolean().default(true),
        allow_comments: z.boolean().default(true),
        allow_likes: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (context.claims.is_anonymous) throw new Error("Host sign-in required");
    const base = slugify(data.name) || "event";
    let slug = `${base}-${randSuffix(4)}`;
    // Ensure uniqueness (retry a couple times if collision)
    for (let i = 0; i < 3; i++) {
      const { data: existing } = await context.supabase
        .from("events")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      slug = `${base}-${randSuffix(5)}`;
    }
    let password_hash: string | null = null;
    if (data.password) {
      const { hashEventPassword } = await import("@/lib/guest/guest.server");
      password_hash = await hashEventPassword(data.password);
    }
    const { data: inserted, error } = await context.supabase
      .from("events")
      .insert({
        owner_id: context.userId,
        slug,
        name: data.name,
        description: data.description ?? null,
        venue: data.venue ?? null,
        event_date: data.event_date ?? null,
        password_hash,
        status: "active",
        allow_uploads: data.allow_uploads,
        allow_downloads: data.allow_downloads,
        allow_comments: data.allow_comments,
        allow_likes: data.allow_likes,
      })
      .select("id, slug")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Failed to create event");
    return { ok: true as const, event: inserted };
  });

// ---- Get one event ----
export const getEventDetail = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    if (context.claims.is_anonymous) throw new Error("Host sign-in required");
    const { data: event, error } = await context.supabase
      .from("events")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!event) return { ok: false as const };

    const [
      { count: photo_count },
      { count: guest_count },
      { count: today_downloads },
      { count: reports_open },
    ] = await Promise.all([
      context.supabase
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .is("deleted_at", null),
      context.supabase
        .from("guests")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id),
      context.supabase
        .from("downloads")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      // Count open reports through the photo relation instead of fetching every photo id.
      context.supabase
        .from("reports")
        .select("id, photos!inner(event_id)", { count: "exact", head: true })
        .eq("status", "open")
        .eq("photos.event_id", event.id),
    ]);

    return {
      ok: true as const,
      event,
      stats: {
        photos: photo_count ?? 0,
        guests: guest_count ?? 0,
        downloads_today: today_downloads ?? 0,
        reports_open: reports_open ?? 0,
      },
    };
  });

// ---- Update settings ----
export const updateEvent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d) =>
    z
      .object({
        id: uuid,
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(1000).nullable().optional(),
        venue: z.string().trim().max(200).nullable().optional(),
        event_date: z.string().date().nullable().optional(),
        password: z.union([z.string().min(4).max(200), z.literal(""), z.null()]).optional(),
        status: z.enum(["draft", "active", "archived"]).optional(),
        allow_uploads: z.boolean().optional(),
        allow_downloads: z.boolean().optional(),
        allow_comments: z.boolean().optional(),
        allow_likes: z.boolean().optional(),
        show_exif: z.boolean().optional(),
        allow_videos: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (context.claims.is_anonymous) throw new Error("Host sign-in required");
    const patch: {
      name?: string;
      description?: string | null;
      venue?: string | null;
      event_date?: string | null;
      status?: string;
      allow_uploads?: boolean;
      allow_downloads?: boolean;
      allow_comments?: boolean;
      allow_likes?: boolean;
      show_exif?: boolean;
      allow_videos?: boolean;
      password_hash?: string | null;
    } = {};
    for (const k of [
      "name",
      "description",
      "venue",
      "event_date",
      "status",
      "allow_uploads",
      "allow_downloads",
      "allow_comments",
      "allow_likes",
      "show_exif",
      "allow_videos",
    ] as const) {
      if (data[k] !== undefined) (patch as Record<string, unknown>)[k] = data[k];
    }
    if (data.password !== undefined) {
      if (data.password === null || data.password === "") {
        patch.password_hash = null;
      } else {
        const { hashEventPassword } = await import("@/lib/guest/guest.server");
        patch.password_hash = await hashEventPassword(data.password);
      }
    }
    const { error } = await context.supabase.from("events").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const archiveEvent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    if (context.claims.is_anonymous) throw new Error("Host sign-in required");
    const { error } = await context.supabase
      .from("events")
      .update({ deleted_at: new Date().toISOString(), status: "archived" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---- Photos moderation ----
export const listAdminPhotos = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d) =>
    z
      .object({
        eventId: uuid,
        filter: z.enum(["all", "pinned", "featured", "reported", "hidden"]).default("all"),
        cursor: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (context.claims.is_anonymous) throw new Error("Host sign-in required");
    // Confirm ownership via RLS.
    const { data: ev, error: evErr } = await context.supabase
      .from("events")
      .select("id")
      .eq("id", data.eventId)
      .maybeSingle();
    if (evErr) throw new Error(evErr.message);
    if (!ev) throw new Error("Event not found");

    const limit = data.limit ?? 30;
    let q = context.supabase
      .from("photos")
      .select(
        "id, storage_path, width, height, filter_applied, taken_at, guest_id, is_pinned, is_featured, status, deleted_at",
      )
      .eq("event_id", data.eventId)
      .order("taken_at", { ascending: false })
      .limit(limit + 1);

    if (data.filter === "pinned") q = q.eq("is_pinned", true).is("deleted_at", null);
    else if (data.filter === "featured") q = q.eq("is_featured", true).is("deleted_at", null);
    else if (data.filter === "hidden") q = q.not("deleted_at", "is", null);
    else if (data.filter === "reported") {
      // Scope open reports to this event so other events' reports never leak in.
      const { data: r } = await context.supabase
        .from("reports")
        .select("photo_id, photos!inner(event_id)")
        .eq("status", "open")
        .eq("photos.event_id", data.eventId);

      const ids = (r ?? []).map((x) => x.photo_id);
      if (ids.length === 0) return { ok: true as const, photos: [], nextCursor: null };
      q = q.in("id", ids);
    } else {
      q = q.is("deleted_at", null);
    }
    if (data.cursor) q = q.lt("taken_at", data.cursor);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const hasMore = (rows?.length ?? 0) > limit;
    const trimmed = hasMore ? rows!.slice(0, limit) : (rows ?? []);
    const nextCursor = hasMore ? trimmed[trimmed.length - 1].taken_at : null;

    const guestIds = Array.from(
      new Set(trimmed.map((r) => r.guest_id).filter(Boolean)),
    ) as string[];
    const guests = guestIds.length
      ? ((await context.supabase.from("guests").select("id, name").in("id", guestIds)).data ?? [])
      : [];
    const map = new Map(guests.map((g) => [g.id, g.name]));

    const photos = await Promise.all(
      trimmed.map(async (p) => ({
        id: p.id,
        url: await signedPhotoUrl(context.supabase as unknown as HostClient, p.storage_path),
        width: p.width,
        height: p.height,
        filter: p.filter_applied,
        taken_at: p.taken_at,
        guest_name: p.guest_id ? (map.get(p.guest_id) ?? null) : null,
        is_pinned: p.is_pinned,
        is_featured: p.is_featured,
        status: p.status,
        deleted_at: p.deleted_at,
      })),
    );
    return { ok: true as const, photos, nextCursor };
  });

export const moderatePhotos = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d) =>
    z
      .object({
        eventId: uuid,
        photoIds: z.array(uuid).min(1).max(200),
        action: z.enum(["hide", "restore", "pin", "unpin", "feature", "unfeature", "delete"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (context.claims.is_anonymous) throw new Error("Host sign-in required");
    // Ownership check via RLS.
    const { data: ev } = await context.supabase
      .from("events")
      .select("id")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) throw new Error("Event not found");

    const patch: {
      deleted_at?: string | null;
      is_pinned?: boolean;
      is_featured?: boolean;
      status?: string;
    } = {};
    switch (data.action) {
      case "hide":
        patch.deleted_at = new Date().toISOString();
        break;
      case "restore":
        patch.deleted_at = null;
        break;
      case "pin":
        patch.is_pinned = true;
        break;
      case "unpin":
        patch.is_pinned = false;
        break;
      case "feature":
        patch.is_featured = true;
        break;
      case "unfeature":
        patch.is_featured = false;
        break;
      case "delete":
        patch.deleted_at = new Date().toISOString();
        patch.status = "rejected";
        break;
    }
    // Use context.supabase — RLS scoped to owner.
    const { error } = await context.supabase
      .from("photos")
      .update(patch)
      .in("id", data.photoIds)
      .eq("event_id", data.eventId);
    if (error) throw new Error(error.message);

    if (data.action === "hide" || data.action === "delete") {
      await context.supabase
        .from("reports")
        .update({ status: "resolved" })
        .in("photo_id", data.photoIds);
    }
    return { ok: true as const };
  });

// ---- Exports (ZIP download of all approved photos) ----
export const listEventExports = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d) => z.object({ eventId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    if (context.claims.is_anonymous) throw new Error("Host sign-in required");
    const { data: ev } = await context.supabase
      .from("events")
      .select("id")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) throw new Error("Event not found");
    const { data: rows, error } = await context.supabase
      .from("exports")
      .select("id, status, file_path, expires_at, created_at, scope")
      .eq("event_id", data.eventId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    const exports_ = await Promise.all(
      (rows ?? []).map(async (r) => ({
        id: r.id,
        status: r.status,
        created_at: r.created_at,
        expires_at: r.expires_at,
        photo_count: (r.scope as { photo_count?: number } | null)?.photo_count ?? null,
        url:
          r.file_path && r.status === "ready"
            ? ((await context.supabase.storage.from("exports").createSignedUrl(r.file_path, 3600))
                .data?.signedUrl ?? null)
            : null,
      })),
    );
    return { ok: true as const, exports: exports_ };
  });

export const createEventExport = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d) => z.object({ eventId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    if (context.claims.is_anonymous) throw new Error("Host sign-in required");
    const { data: ev } = await context.supabase
      .from("events")
      .select("id, slug")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) throw new Error("Event not found");

    const { data: photos, error: pErr } = await context.supabase
      .from("photos")
      .select("id, storage_path, taken_at, filter_applied")
      .eq("event_id", data.eventId)
      .eq("status", "approved")
      .is("deleted_at", null)
      .order("taken_at", { ascending: true })
      .limit(2000);
    if (pErr) throw new Error(pErr.message);
    if (!photos || photos.length === 0) throw new Error("No photos to export yet.");

    const { data: row, error: insErr } = await context.supabase
      .from("exports")
      .insert({
        event_id: data.eventId,
        requested_by: context.userId,
        scope: { type: "all-approved", photo_count: photos.length },
        status: "processing",
      })
      .select("id")
      .single();
    if (insErr || !row) throw new Error(insErr?.message ?? "Failed to queue export");

    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      let idx = 1;
      for (const p of photos) {
        const { data: blob } = await context.supabase.storage
          .from("photos")
          .download(p.storage_path);
        if (!blob) continue;
        const ext = p.storage_path.split(".").pop() || "jpg";
        const stamp = new Date(p.taken_at).toISOString().replace(/[:.]/g, "-");
        zip.file(`${String(idx).padStart(4, "0")}_${stamp}.${ext}`, await blob.arrayBuffer());
        idx += 1;
      }
      const buf = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
      const path = `${data.eventId}/alivecap-${ev.slug}-${Date.now()}.zip`;
      const { error: upErr } = await context.supabase.storage.from("exports").upload(path, buf, {
        contentType: "application/zip",
        upsert: false,
      });
      if (upErr) throw upErr;

      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      await context.supabase
        .from("exports")
        .update({
          status: "ready",
          file_path: path,
          expires_at: expiresAt,
        })
        .eq("id", row.id);

      const { data: signed } = await context.supabase.storage
        .from("exports")
        .createSignedUrl(path, 3600);
      return {
        ok: true as const,
        id: row.id,
        url: signed?.signedUrl ?? null,
        count: photos.length,
      };
    } catch (e) {
      await context.supabase.from("exports").update({ status: "failed" }).eq("id", row.id);
      throw e instanceof Error ? e : new Error("Export failed");
    }
  });
