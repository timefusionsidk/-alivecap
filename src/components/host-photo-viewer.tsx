import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Pin, Play, Pause, Star } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";

type Photo = {
  id: string;
  url: string | null;
  guest_name: string | null;
  taken_at: string;
  is_featured: boolean;
  is_pinned: boolean;
  deleted_at: string | null;
};
type Action = "hide" | "restore" | "pin" | "unpin" | "feature" | "unfeature";
export function HostPhotoViewer({
  photos,
  selectedId,
  onClose,
  pending,
  onModerate,
}: {
  photos: Photo[];
  selectedId: string;
  onClose: () => void;
  pending: boolean;
  onModerate: (action: Action, id: string) => void;
}) {
  const [id, setId] = useState(selectedId);
  const [opener] = useState(() =>
    typeof document !== "undefined" ? (document.activeElement as HTMLElement) : null,
  );
  const [playing, setPlaying] = useState(false);
  const index = photos.findIndex((p) => p.id === id);
  const photo = photos[index];
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if ((event.target as HTMLElement).closest("input,textarea,[contenteditable=true]")) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const next =
          (index + (event.key === "ArrowRight" ? 1 : -1) + photos.length) % photos.length;
        if (photos[next]) setId(photos[next].id);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, photos]);
  useEffect(() => {
    if (!playing || !photos.length) return;
    const timeout = setTimeout(() => setId(photos[(index + 1) % photos.length].id), 5000);
    return () => clearTimeout(timeout);
  }, [playing, index, photos]);
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
        className={`photo-viewer ${playing ? "is-slideshow" : ""}`}
      >
        <DialogTitle className="sr-only">Event photo viewer</DialogTitle>
        <DialogDescription className="sr-only">
          Browse event photos and manage their visibility.
        </DialogDescription>
        <div className="viewer-toolbar flex items-center gap-4 px-4">
          <Brand />
          <span className="text-xs text-muted-foreground">
            {index + 1} / {photos.length}
          </span>
          <Button variant="ghost" onClick={() => setPlaying(!playing)} disabled={!photo}>
            {playing ? <Pause /> : <Play />}
            {playing ? "Pause" : "Slideshow"}
          </Button>
        </div>
        <div className="viewer-image relative flex items-center justify-center">
          {photo?.url ? (
            <img
              src={photo.url}
              alt={`Photo by ${photo.guest_name || "Guest"}`}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <p className="p-12 text-muted-foreground">
              This photo is no longer available in this view.
            </p>
          )}
          <Button
            className="absolute left-3"
            size="icon"
            variant="secondary"
            aria-label="Previous photo"
            disabled={!photos.length}
            onClick={() => setId(photos[(index - 1 + photos.length) % photos.length].id)}
          >
            <ChevronLeft />
          </Button>
          <Button
            className="absolute right-3"
            size="icon"
            variant="secondary"
            aria-label="Next photo"
            disabled={!photos.length}
            onClick={() => setId(photos[(index + 1) % photos.length].id)}
          >
            <ChevronRight />
          </Button>
        </div>
        {photo && (
          <aside className="viewer-info p-6">
            <h2 className="text-3xl">Shot by {photo.guest_name || "Guest"}</h2>
            <p className="my-3 text-xs text-muted-foreground">
              {new Date(photo.taken_at).toLocaleString()}
            </p>
            {!playing && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={pending}
                  aria-pressed={photo.is_featured}
                  onClick={() => onModerate(photo.is_featured ? "unfeature" : "feature", photo.id)}
                >
                  <Star />
                  {photo.is_featured ? "Unfeature" : "Feature"}
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  aria-pressed={photo.is_pinned}
                  onClick={() => onModerate(photo.is_pinned ? "unpin" : "pin", photo.id)}
                >
                  <Pin />
                  {photo.is_pinned ? "Unpin" : "Pin"}
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => onModerate(photo.deleted_at ? "restore" : "hide", photo.id)}
                >
                  {photo.deleted_at ? <Eye /> : <EyeOff />}
                  {photo.deleted_at ? "Restore" : "Hide"}
                </Button>
              </div>
            )}
          </aside>
        )}
      </DialogContent>
    </Dialog>
  );
}
