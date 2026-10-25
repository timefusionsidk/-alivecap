import { GuestNav } from "@/components/guest-nav";
import { GuestPhoto } from "@/components/guest-photo";
import { Brand } from "@/components/brand";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Camera as CameraIcon,
  ChevronLeft,
  ChevronRight,
  Heart,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";
import {
  addComment,
  listComments,
  listEventPhotos,
  toggleLike,
} from "@/lib/guest/gallery.functions";
import { supabase } from "@/integrations/supabase/client";
import { useGuestSession } from "@/lib/guest/use-guest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Photo = {
  id: string;
  url: string | null;
  width: number | null;
  height: number | null;
  filter: string | null;
  media_type: string;
  taken_at: string;
  guest_name: string | null;
  likes: number;
  comments: number;
  liked_by_me: boolean;
};

export const Route = createFileRoute("/e/$slug/gallery")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: `Live gallery — ${params.slug} — alivecap` },
      { name: "description", content: "Every photo, as it happens." },
      { name: "robots", content: "noindex" },
      { name: "theme-color", content: "#0b0b0d" },
    ],
  }),
  component: GalleryScreen,
});

function GalleryScreen() {
  const { slug } = Route.useParams();
  const list = useServerFn(listEventPhotos);
  const { token } = useGuestSession();
  const qc = useQueryClient();
  const [connection, setConnection] = useState("Connecting");

  const infQ = useInfiniteQuery({
    queryKey: ["gallery", slug, !!token],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => list({ data: { slug, cursor: pageParam, limit: 24 } }),
    getNextPageParam: (last) => (last.ok ? (last.nextCursor ?? undefined) : undefined),
    refetchInterval: 15000,
    gcTime: 0,
  });

  const firstOk = infQ.data?.pages[0];
  const eventInfo = firstOk?.ok ? firstOk.event : null;
  const photos: Photo[] = useMemo(
    () =>
      (infQ.data?.pages ?? [])
        .flatMap((p) => (p.ok ? p.photos : []))
        .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i),
    [infQ.data],
  );

  // Realtime: new photos / likes / comments for this event
  useEffect(() => {
    if (!eventInfo?.id) return;
    const ch = supabase
      .channel(`event:${eventInfo.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "photos", filter: `event_id=eq.${eventInfo.id}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["gallery", slug] });
          void qc.invalidateQueries({ queryKey: ["guest-photo"] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, () =>
        qc.invalidateQueries({ queryKey: ["gallery", slug] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () =>
        qc.invalidateQueries({ queryKey: ["gallery", slug] }),
      )
      .subscribe((status) =>
        setConnection(
          status === "SUBSCRIBED"
            ? "Connected"
            : status === "CHANNEL_ERROR"
              ? "Connection error"
              : "Reconnecting",
        ),
      );
    const offline = () => setConnection("Offline");
    const online = () => {
      setConnection("Reconnecting");
      void qc.invalidateQueries({ queryKey: ["gallery", slug] });
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      void supabase.removeChannel(ch);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [eventInfo?.id, qc, slug]);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = infQ;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [slideshow, setSlideshow] = useState(false);

  // Slideshow autoplay
  useEffect(() => {
    if (!slideshow || viewerIndex === null || photos.length === 0) return;
    const t = setTimeout(() => {
      setViewerIndex((i) => (i === null ? 0 : (i + 1) % photos.length));
    }, 4000);
    return () => clearTimeout(t);
  }, [slideshow, viewerIndex, photos.length]);

  return (
    <div className="guest-shell">
      <GuestNav slug={slug} screen="gallery" />
      <main className="gallery-page">
        <div className="mb-7">
          <Brand />
        </div>
        <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0b0b0d]/85 backdrop-blur">
          <div className="flex w-full items-center gap-3 px-4 py-3">
            <Link
              to="/e/$slug/camera"
              params={{ slug }}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/5 hover:bg-white/10"
              aria-label="Back to camera"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="connection-state" data-live={connection === "Connected"} role="status">
                {connection === "Connected" ? "Live updates connected" : connection}
              </p>
              <h1 className="truncate font-display text-xl">{eventInfo?.name ?? "Loading…"}</h1>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="rounded-full"
              disabled={photos.length === 0}
              onClick={() => {
                setViewerIndex(0);
                setSlideshow(true);
              }}
            >
              <Play className="mr-2 h-3.5 w-3.5" /> Slideshow
            </Button>
            <Link
              to="/e/$slug/camera"
              params={{ slug }}
              className="ml-1 hidden rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 sm:inline-flex sm:items-center"
            >
              <CameraIcon className="mr-2 h-3.5 w-3.5" /> Shoot
            </Link>
          </div>
        </header>

        <section className="w-full px-3 py-4">
          {infQ.isLoading ? (
            <div className="grid place-items-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-white/60" />
            </div>
          ) : infQ.isError ? (
            <div className="py-20 text-center">
              <h2 className="text-3xl">Gallery unavailable</h2>
              <p className="my-4 text-muted-foreground">
                {toUserMessage(infQ.error, "Check your connection or rejoin the event.")}
              </p>
              <Button onClick={() => infQ.refetch()}>Try again</Button>
              <Link to="/join/$slug" params={{ slug }} className="ml-4 underline">
                Join event
              </Link>
            </div>
          ) : firstOk && !firstOk.ok ? (
            <div className="py-20 text-center">
              <h2 className="text-3xl">Join to view this gallery</h2>
              <p className="my-4 text-muted-foreground">
                This event may have closed, or your access may have changed.
              </p>
              <Button asChild>
                <Link to="/join/$slug" params={{ slug }}>
                  Check event access
                </Link>
              </Button>
            </div>
          ) : photos.length === 0 ? (
            <EmptyState slug={slug} />
          ) : (
            <div className="photo-wall">
              {photos.map((p, i) => (
                <PhotoTile
                  key={p.id}
                  photo={p}
                  onOpen={() => {
                    setViewerIndex(i);
                    setSlideshow(false);
                  }}
                />
              ))}
            </div>
          )}
          <div ref={sentinelRef} className="h-16" />
          {infQ.isFetchingNextPage && (
            <div className="grid place-items-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-white/50" />
            </div>
          )}
        </section>

        <AnimatePresence>
          {viewerIndex !== null && photos[viewerIndex] && (
            <PhotoViewer
              slug={slug}
              photos={photos}
              index={viewerIndex}
              setIndex={setViewerIndex}
              slideshow={slideshow}
              setSlideshow={setSlideshow}
              allowComments={eventInfo?.allow_comments ?? true}
              allowLikes={eventInfo?.allow_likes ?? true}
              onClose={() => {
                setViewerIndex(null);
                setSlideshow(false);
              }}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function EmptyState({ slug }: { slug: string }) {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[0.02] p-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
        <CameraIcon className="h-6 w-6" />
      </div>
      <h2 className="mt-5 font-display text-2xl">Be the first to shoot</h2>
      <p className="mt-2 text-sm text-white/60">
        Photos appear here the moment guests capture them.
      </p>
      <Link
        to="/e/$slug/camera"
        params={{ slug }}
        className="mt-6 inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
      >
        <CameraIcon className="mr-2 h-4 w-4" /> Open camera
      </Link>
    </div>
  );
}

function PhotoTile({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  const ratio = photo.width && photo.height ? photo.height / photo.width : 1;
  return (
    <motion.button
      layout
      onClick={onOpen}
      className="photo-frame group"
      aria-label={`Open photo by ${photo.guest_name || "Guest"}`}
    >
      <GuestPhoto
        id={photo.id}
        alt={`Photo by ${photo.guest_name || "Guest"}`}
        style={{ aspectRatio: `1 / ${ratio}` }}
      />
      <div className="photo-meta">
        <span className="truncate text-[11px] text-white/80">{photo.guest_name ?? ""}</span>
        <span className="flex items-center gap-2 text-[11px] text-white/80">
          {photo.likes > 0 && (
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3" /> {photo.likes}
            </span>
          )}
          {photo.comments > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> {photo.comments}
            </span>
          )}
        </span>
      </div>
    </motion.button>
  );
}

function PhotoViewer({
  slug,
  photos,
  index,
  setIndex,
  slideshow,
  setSlideshow,
  onClose,
  allowComments,
  allowLikes,
}: {
  slug: string;
  photos: Photo[];
  index: number;
  setIndex: (updater: number | ((prev: number | null) => number | null)) => void;
  slideshow: boolean;
  setSlideshow: (v: boolean) => void;
  onClose: () => void;
  allowComments: boolean;
  allowLikes: boolean;
}) {
  const photo = photos[index];
  const [opener] = useState(() =>
    typeof document !== "undefined" ? (document.activeElement as HTMLElement) : null,
  );
  const like = useServerFn(toggleLike);
  const addC = useServerFn(addComment);
  const listC = useServerFn(listComments);
  const qc = useQueryClient();
  const { token } = useGuestSession();

  const commentsQ = useQuery({
    queryKey: ["comments", photo.id],
    queryFn: () => listC({ data: { photoId: photo.id } }),
    enabled: allowComments,
  });

  const likeMut = useMutation({
    mutationFn: () => like({ data: { photoId: photo.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gallery", slug] }),
    onError: (e: unknown) => toast.error(toUserMessage(e)),
  });

  const [draft, setDraft] = useState("");
  const commentMut = useMutation({
    mutationFn: (body: string) => addC({ data: { photoId: photo.id, body } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["comments", photo.id] });
      qc.invalidateQueries({ queryKey: ["gallery", slug] });
    },
    onError: (e: unknown) => toast.error(toUserMessage(e)),
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]")) return;
      if (e.key === "ArrowRight") setIndex((i) => (i === null ? 0 : (i + 1) % photos.length));
      if (e.key === "ArrowLeft")
        setIndex((i) => (i === null ? 0 : (i - 1 + photos.length) % photos.length));
      if (e.key === " ") {
        e.preventDefault();
        setSlideshow(!slideshow);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length, setIndex, onClose, slideshow, setSlideshow]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener?.focus();
        }}
        className={cn("photo-viewer", slideshow && "is-slideshow")}
        showCloseButton={false}
        aria-describedby="photo-description"
      >
        <DialogTitle className="sr-only">Photo by {photo.guest_name || "Guest"}</DialogTitle>
        <DialogDescription id="photo-description" className="sr-only">
          Use previous and next to browse. Escape closes the viewer.
        </DialogDescription>
        <div className="viewer-toolbar flex items-center justify-between px-4 py-3">
          <Brand />
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="text-xs text-white/60">
            {index + 1} / {photos.length}
          </div>
          <button
            onClick={() => setSlideshow(!slideshow)}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-full",
              slideshow ? "bg-primary text-primary-foreground" : "bg-white/10 hover:bg-white/20",
            )}
            aria-label={slideshow ? "Pause slideshow" : "Play slideshow"}
          >
            {slideshow ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        </div>

        <div className="viewer-image relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2">
          <button
            onClick={() =>
              setIndex((i) => (i === null ? 0 : (i - 1 + photos.length) % photos.length))
            }
            className="absolute left-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20 sm:grid"
            aria-label="Previous"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <GuestPhoto
            key={photo.id}
            id={photo.id}
            alt={`Photo by ${photo.guest_name || "Guest"}`}
            eager
            className="max-h-full max-w-full"
          />
          <button
            onClick={() => setIndex((i) => (i === null ? 0 : (i + 1) % photos.length))}
            className="absolute right-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20 sm:grid"
            aria-label="Next"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="viewer-info border-t border-white/5 bg-black/70 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
          <div className="flex w-full items-center justify-between gap-3 text-sm">
            <div className="truncate text-white/70">
              {photo.guest_name ? (
                <span>
                  Shot by <span className="text-white">{photo.guest_name}</span>
                </span>
              ) : (
                "Anonymous"
              )}
            </div>
            <div className="flex items-center gap-2">
              {allowLikes && (
                <button
                  aria-label={photo.liked_by_me ? "Unlike photo" : "Like photo"}
                  aria-pressed={photo.liked_by_me}
                  onClick={() => token && likeMut.mutate()}
                  disabled={!token || likeMut.isPending}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs",
                    photo.liked_by_me
                      ? "bg-rose-500/20 text-rose-300"
                      : "bg-white/10 text-white/80 hover:bg-white/20",
                  )}
                >
                  <Heart className={cn("h-4 w-4", photo.liked_by_me && "fill-current")} />
                  {photo.likes}
                </button>
              )}
            </div>
          </div>

          {allowComments && !slideshow && (
            <div className="mx-auto mt-3 max-w-2xl">
              <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1 text-sm">
                {commentsQ.data?.ok && commentsQ.data.comments.length > 0 ? (
                  commentsQ.data.comments.map((c) => (
                    <div key={c.id} className="rounded-lg bg-white/5 px-3 py-1.5">
                      <span className="text-white/60">{c.author}</span>{" "}
                      <span className="text-white/90">{c.body}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-white/40">No comments yet.</p>
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!token) {
                    toast.error("Join the event first");
                    return;
                  }
                  const v = draft.trim();
                  if (!v) return;
                  commentMut.mutate(v);
                }}
                className="mt-2 flex items-center gap-2"
              >
                <Input
                  aria-label="Leave a comment"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={token ? "Say something…" : "Join to comment"}
                  className="h-9 border-white/10 bg-white/5 text-sm text-white placeholder:text-white/40"
                  maxLength={500}
                />
                <Button
                  aria-label="Post comment"
                  type="submit"
                  size="sm"
                  disabled={!token || commentMut.isPending || !draft.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
