import { HostPhotoViewer } from "@/components/host-photo-viewer";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  EyeOff,
  Eye,
  Loader2,
  Pin,
  PinOff,
  Sparkles,
  Star,
  Trash2,
  ImageIcon,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listAdminPhotos, moderatePhotos } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/_authenticated/events/$id/photos")({
  head: () => ({ meta: [{ title: "Photos — alivecap" }, { name: "robots", content: "noindex" }] }),
  component: EventPhotos,
});

type Filter = "all" | "pinned" | "featured" | "reported" | "hidden";

function EventPhotos() {
  const { id } = Route.useParams();
  const listFn = useServerFn(listAdminPhotos);
  const modFn = useServerFn(moderatePhotos);
  const qc = useQueryClient();

  const [viewer, setViewer] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => setSelected(new Set()), [filter]);

  const infQ = useInfiniteQuery({
    queryKey: ["admin-photos", id, filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listFn({ data: { eventId: id, filter, cursor: pageParam } }),
    getNextPageParam: (last) => (last.ok ? (last.nextCursor ?? undefined) : undefined),
  });

  const photos = useMemo(
    () => (infQ.data?.pages ?? []).flatMap((p) => (p.ok ? p.photos : [])),
    [infQ.data],
  );

  const mut = useMutation({
    mutationFn: (vars: {
      action: "hide" | "restore" | "pin" | "unpin" | "feature" | "unfeature" | "delete";
      ids: string[];
    }) => modFn({ data: { eventId: id, photoIds: vars.ids, action: vars.action } }),
    onSuccess: (_r, vars) => {
      toast.success(`${vars.ids.length} photo${vars.ids.length > 1 ? "s" : ""} updated`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin-photos", id] });
      qc.invalidateQueries({ queryKey: ["event-detail", id] });
    },
    onError: (e: unknown) => toast.error(toUserMessage(e)),
  });

  function toggle(pid: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });
  }

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = infQ;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "pinned", label: "Pinned" },
    { id: "featured", label: "Featured" },
    { id: "reported", label: "Reported" },
    { id: "hidden", label: "Hidden" },
  ];
  const selectedIds = Array.from(selected);

  return (
    <div>
      {viewer && (
        <HostPhotoViewer
          photos={photos}
          selectedId={viewer}
          onClose={() => setViewer(null)}
          pending={mut.isPending}
          onModerate={(action, photoId) => mut.mutate({ action, ids: [photoId] })}
        />
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-full border border-border bg-card p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs transition",
                filter === f.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
            <Button
              disabled={mut.isPending}
              size="sm"
              variant="secondary"
              onClick={() => mut.mutate({ action: "pin", ids: selectedIds })}
            >
              <Pin className="mr-1.5 h-3.5 w-3.5" /> Pin
            </Button>
            <Button
              disabled={mut.isPending}
              size="sm"
              variant="secondary"
              onClick={() => mut.mutate({ action: "feature", ids: selectedIds })}
            >
              <Star className="mr-1.5 h-3.5 w-3.5" /> Feature
            </Button>
            {filter === "hidden" ? (
              <Button
                disabled={mut.isPending}
                size="sm"
                variant="secondary"
                onClick={() => mut.mutate({ action: "restore", ids: selectedIds })}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Restore
              </Button>
            ) : (
              <Button
                disabled={mut.isPending}
                size="sm"
                variant="secondary"
                onClick={() => mut.mutate({ action: "hide", ids: selectedIds })}
              >
                <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Hide
              </Button>
            )}
            <Button
              disabled={mut.isPending}
              size="sm"
              variant="destructive"
              onClick={() => mut.mutate({ action: "delete", ids: selectedIds })}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      {infQ.isLoading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : infQ.isError ? (
        <div className="py-16 text-center">
          <h2 className="text-3xl">Photos could not load</h2>
          <p className="my-4 text-muted-foreground">{toUserMessage(infQ.error)}</p>
          <Button onClick={() => infQ.refetch()}>Try again</Button>
        </div>
      ) : photos.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-12 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Nothing here yet.</p>
        </div>
      ) : (
        <div className="photo-wall">
          {photos.map((p) => {
            const isSel = selected.has(p.id);
            return (
              <div key={p.id} className="relative">
                <button
                  onClick={() => toggle(p.id)}
                  aria-pressed={isSel}
                  aria-label={`Select photo by ${p.guest_name || "Guest"}`}
                  disabled={mut.isPending}
                  className={cn(
                    "photo-frame group overflow-hidden border outline-none",
                    isSel
                      ? "border-primary ring-2 ring-primary"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  {p.url ? (
                    <img
                      src={p.url}
                      alt={`Photo by ${p.guest_name || "Guest"}`}
                      loading="lazy"
                      style={{ aspectRatio: `${p.width || 4} / ${p.height || 5}` }}
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">
                      unavailable
                    </div>
                  )}
                  {p.deleted_at && (
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white">
                      Hidden
                    </span>
                  )}
                  <div className="absolute right-2 top-2 flex gap-1">
                    {p.is_pinned && (
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white">
                        <Pin className="h-3 w-3" />
                      </span>
                    )}
                    {p.is_featured && (
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Star className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "absolute left-2 bottom-2 grid h-6 w-6 place-items-center rounded-full border",
                      isSel
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/60 bg-black/40 text-white opacity-0 group-hover:opacity-100",
                    )}
                  >
                    {isSel && <Check className="h-3.5 w-3.5" />}
                  </div>
                  {p.guest_name && <div className="photo-meta">{p.guest_name}</div>}
                </button>
                <Button
                  className="absolute bottom-8 right-2"
                  size="sm"
                  variant="secondary"
                  onClick={() => setViewer(p.id)}
                  aria-label={`View photo by ${p.guest_name || "Guest"}`}
                >
                  View
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <div ref={sentinelRef} className="h-16" />
      {infQ.isFetchingNextPage && (
        <div className="grid place-items-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" /> Tip: click photos to multi-select, then batch pin,
        feature, hide, or delete.
      </div>
    </div>
  );
}
