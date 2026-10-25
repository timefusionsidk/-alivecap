import { GuestNav } from "@/components/guest-nav";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";
import {
  Camera as CameraIcon,
  Check,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
  Zap,
  ZapOff,
  LogOut,
} from "lucide-react";
import { getCurrentGuest, uploadGuestPhoto } from "@/lib/guest/guest.functions";
import { FILTER_PRESETS, getFilterCss } from "@/lib/guest/filters";
import { clearGuestSession, useGuestSession } from "@/lib/guest/use-guest";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/e/$slug/camera")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Camera — alivecap" },
      { name: "description", content: "Shoot for the live event gallery." },
      { name: "robots", content: "noindex" },
      { name: "theme-color", content: "#111111" },
    ],
  }),
  component: CameraScreen,
});

type UploadItem = {
  id: string;
  status: "uploading" | "done" | "error";
  thumb: string;
};

function CameraScreen() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { token, hydrated } = useGuestSession();
  const currentGuest = useServerFn(getCurrentGuest);
  const upload = useServerFn(uploadGuestPhoto);

  const guestQ = useQuery({
    queryKey: ["current-guest", token, slug],
    queryFn: () => currentGuest({ data: { slug } }),
    refetchInterval: 15000,
    enabled: !!token,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const countdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [grid, setGrid] = useState(false);
  const [timer, setTimer] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [filterId, setFilterId] = useState("none");
  const [flash, setFlash] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, setDenied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Redirect to join if session is bad.
  useEffect(() => {
    if (!hydrated) return; // still reading localStorage
    if (!token) navigate({ to: "/join/$slug", params: { slug }, replace: true });
  }, [token, hydrated, slug, navigate]);

  useEffect(() => {
    console.log("Camera Mounted");
  }, []);

  useEffect(() => {
    if (guestQ.data && !guestQ.data.ok) {
      void clearGuestSession();
      navigate({ to: "/join/$slug", params: { slug }, replace: true });
    }
  }, [guestQ.data, slug, navigate]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  const startStream = useCallback(async () => {
    setError(null);
    setDenied(false);
    stopStream();
    const generation = ++generationRef.current;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera isn't available in this browser.");
      setDenied(true);
      return;
    }
    console.log("Requesting Camera");
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: false,
        });
      } catch (inner) {
        const name = (inner as DOMException)?.name;
        if (name === "NotAllowedError" || name === "SecurityError") throw inner;
        // Fall back to any available camera (e.g. laptops with no rear camera).
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      const track = stream.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
        torch?: boolean;
      };
      setTorchSupported(!!caps.torch);
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setReady(true);
      console.log("Camera Ready");
    } catch (e) {
      console.error("Camera Error", e);
      const name = (e as DOMException)?.name;
      const isDenied = name === "NotAllowedError" || name === "SecurityError";
      setDenied(true);
      setError(
        isDenied
          ? "Camera access is blocked. Allow camera for this site in your browser settings, then tap Retry."
          : name === "NotFoundError"
            ? "No camera was found on this device. You can still upload photos from your gallery."
            : "Couldn't start the camera. Tap Retry, or upload from your gallery.",
      );
    }
  }, [facing, stopStream]);

  const uploadFiles = useCallback(
    async (files: FileList | null) => {
      if (
        !files?.length ||
        !navigator.onLine ||
        !guestQ.data?.ok ||
        !guestQ.data.event.allow_uploads
      )
        return;
      for (const file of Array.from(files).slice(0, 10)) {
        if (!file.type.startsWith("image/")) continue;
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read that file"));
          reader.readAsDataURL(file);
        }).catch(() => null);
        if (!dataUrl) {
          toast.error("Could not read that file");
          continue;
        }
        const id = crypto.randomUUID();
        const item: UploadItem = { id, status: "uploading", thumb: dataUrl };
        setQueue((q) => [item, ...q].slice(0, 12));
        try {
          await upload({ data: { slug, dataUrl } });
          setQueue((q) => q.map((it) => (it.id === id ? { ...it, status: "done" } : it)));
        } catch (e) {
          setQueue((q) => q.map((it) => (it.id === id ? { ...it, status: "error" } : it)));
          toast.error(toUserMessage(e, "Upload failed"));
        }
      }
    },
    [upload, slug, guestQ.data],
  );

  useEffect(() => {
    startStream();
    return () => {
      ++generationRef.current;
      stopStream();
      if (countdownTimer.current) clearTimeout(countdownTimer.current);
    };
  }, [startStream, stopStream]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    try {
      const next = !torch;
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      });
      setTorch(next);
    } catch {
      toast.error("Flash not available on this device");
    }
  }, [torch, torchSupported]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !ready || capturing || !navigator.onLine) return;
    setCapturing(true);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setFlash(true);

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setCapturing(false);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCapturing(false);
      return;
    }
    // Mirror front camera to match preview.
    if (facing === "user") {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    // canvas.filter matches the CSS filter preview on capture.
    (ctx as unknown as { filter: string }).filter = getFilterCss(filterId);
    ctx.drawImage(video, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const thumb = dataUrl;
    const id = crypto.randomUUID();
    const newItem: UploadItem = { id, status: "uploading", thumb };
    setQueue((q) => [newItem, ...q].slice(0, 12));
    setCapturing(false);

    // Fire-and-track upload.
    (async () => {
      try {
        await upload({
          data: {
            slug,
            dataUrl,
            filter: filterId === "none" ? undefined : filterId,
            width: w,
            height: h,
          },
        });
        setQueue((q) => q.map((it) => (it.id === id ? { ...it, status: "done" } : it)));
      } catch (e) {
        setQueue((q) => q.map((it) => (it.id === id ? { ...it, status: "error" } : it)));
        toast.error(toUserMessage(e, "Upload failed"));
      }
    })();
  }, [ready, capturing, facing, filterId, upload, slug]);

  function flipCamera() {
    setTorch(false);
    setFacing((f) => (f === "user" ? "environment" : "user"));
  }

  function leaveEvent() {
    stopStream();
    void clearGuestSession();
    navigate({ to: "/join/$slug", params: { slug }, replace: true });
  }

  const canUpload = online && !!guestQ.data?.ok && guestQ.data.event.allow_uploads;
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!flash) return;
    const timeout = setTimeout(() => setFlash(false), 180);
    return () => clearTimeout(timeout);
  }, [flash]);
  useEffect(() => {
    if (countdown === null) return;
    if (!canUpload) {
      setCountdown(null);
      return;
    }
    countdownTimer.current = setTimeout(() => {
      if (countdown === 1) {
        setCountdown(null);
        void capture();
      } else setCountdown(countdown - 1);
    }, 1000);
    return () => {
      if (countdownTimer.current) clearTimeout(countdownTimer.current);
    };
  }, [countdown, canUpload, capture]);
  function takePhoto() {
    if (!canUpload || countdown !== null) return;
    if (timer) setCountdown(3);
    else void capture();
  }
  async function retryUpload(item: UploadItem) {
    if (!canUpload) return;
    setQueue((q) => q.map((it) => (it.id === item.id ? { ...it, status: "uploading" } : it)));
    try {
      await upload({ data: { slug, dataUrl: item.thumb } });
      setQueue((q) => q.map((it) => (it.id === item.id ? { ...it, status: "done" } : it)));
    } catch (e) {
      setQueue((q) => q.map((it) => (it.id === item.id ? { ...it, status: "error" } : it)));
      toast.error(toUserMessage(e, "Upload failed. Try again when connected."));
    }
  }
  const eventName = guestQ.data?.ok ? guestQ.data.event.name : "";
  const guestName = guestQ.data?.ok ? guestQ.data.guest.name : "";

  return (
    <div className="guest-shell">
      <GuestNav slug={slug} screen="camera" />
      <main className="camera-page">
        <div className="camera-frame">
          {/* Top bar */}
          <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-4 pt-[max(env(safe-area-inset-top),1rem)]">
            <div className="pointer-events-auto rounded-full bg-black/50 px-3 py-1.5 text-xs backdrop-blur">
              <span className="block opacity-70">Shooting for</span>{" "}
              <span className="font-display text-xl">{eventName || "…"}</span>
            </div>
            <button
              onClick={leaveEvent}
              className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-black/50 backdrop-blur hover:bg-black/70"
              aria-label="Leave event"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </header>

          {/* Viewfinder */}
          <div className="relative flex-1 overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted
              className={cn(
                "h-full w-full object-cover transition-[filter] duration-200",
                facing === "user" && "-scale-x-100",
              )}
              style={{ filter: getFilterCss(filterId) }}
            />
            {grid && <div className="camera-grid" />}
            {countdown !== null && (
              <div className="camera-countdown" role="status" aria-live="assertive">
                {countdown}
              </div>
            )}
            <AnimatePresence>
              {flash && (
                <motion.div
                  initial={{ opacity: 0.9 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="pointer-events-none absolute inset-0 bg-white"
                />
              )}
            </AnimatePresence>

            {!ready && !error && (
              <div className="absolute inset-0 grid place-items-center bg-black/70">
                <div className="text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin opacity-70" />
                  <p className="mt-3 text-sm opacity-70">Starting camera…</p>
                </div>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 z-40 grid place-items-center bg-black/90 p-6">
                <div className="max-w-sm text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/10">
                    <CameraIcon className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 font-display text-2xl">Camera unavailable</h2>
                  <p className="mt-2 text-sm opacity-80">{error}</p>
                  <div className="mt-5 flex flex-col gap-2">
                    <Button variant="secondary" onClick={() => startStream()}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Retry camera
                    </Button>
                    <Button
                      variant="outline"
                      className="border-white/20 bg-transparent text-white hover:bg-white/10"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon className="mr-2 h-4 w-4" /> Upload from gallery
                    </Button>
                    <Link
                      to="/e/$slug/gallery"
                      params={{ slug }}
                      className="text-xs underline opacity-70"
                    >
                      Go to the live gallery
                    </Link>
                  </div>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {/* Upload tray */}
            {queue.length > 0 && (
              <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center">
                <div className="pointer-events-auto flex max-w-[92%] gap-2 overflow-x-auto rounded-2xl bg-black/50 p-2 backdrop-blur">
                  {queue.map((item) => (
                    <div
                      key={item.id}
                      className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10"
                    >
                      <img src={item.thumb} alt="" className="h-full w-full object-cover" />
                      <div
                        className={cn(
                          "absolute inset-0 grid place-items-center",
                          item.status === "done" && "bg-black/0",
                          item.status !== "done" && "bg-black/40",
                        )}
                      >
                        {item.status === "uploading" && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        {item.status === "done" && <Check className="h-4 w-4 text-emerald-400" />}
                        {item.status === "error" && (
                          <button
                            className="h-11 w-11 text-xs"
                            aria-label="Retry failed upload"
                            disabled={!canUpload}
                            onClick={() => retryUpload(item)}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Filter strip */}
          <div className="relative z-20 bg-gradient-to-t from-black via-black/85 to-transparent pt-6">
            <div className="filter-strip scrollbar-none flex gap-3 overflow-x-auto px-4 pb-3">
              {FILTER_PRESETS.map((f) => (
                <button
                  key={f.id}
                  aria-pressed={filterId === f.id}
                  onClick={() => setFilterId(f.id)}
                  className={cn(
                    "shrink-0 rounded-2xl border px-3 py-2 text-xs transition",
                    filterId === f.id
                      ? "border-white bg-white text-black"
                      : "border-white/15 bg-white/5 text-white/80 hover:border-white/40",
                  )}
                >
                  {filterId === f.id && <Sparkles className="mr-1 inline h-3 w-3" />}
                  {f.label}
                </button>
              ))}
            </div>

            <div className="camera-tools">
              <button aria-label="Toggle grid" aria-pressed={grid} onClick={() => setGrid(!grid)}>
                Grid
              </button>
              <button
                aria-label="Three second timer"
                aria-pressed={timer}
                disabled={countdown !== null}
                onClick={() => setTimer(!timer)}
              >
                3s timer
              </button>
              <button disabled={!canUpload} onClick={() => fileInputRef.current?.click()}>
                Upload
              </button>
            </div>
            <p className="text-center text-xs text-muted-foreground" role="status">
              {!online
                ? "Offline — reconnect before uploading"
                : !canUpload
                  ? "Uploads are unavailable for this event"
                  : "Photos upload to this event"}
            </p>
            {/* Shutter row */}
            <div className="flex items-center justify-between px-8 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-2">
              <div className="flex flex-col items-center gap-1 opacity-90">
                <Link
                  to="/e/$slug/gallery"
                  params={{ slug }}
                  className="grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Open live gallery"
                >
                  <ImageIcon className="h-5 w-5" />
                </Link>
                <span className="text-[10px] opacity-60">Gallery</span>
              </div>

              <button
                onClick={takePhoto}
                disabled={!ready || capturing || !canUpload || countdown !== null}
                className="group relative grid h-20 w-20 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
                aria-label="Take photo"
              >
                <span className="absolute inset-0 rounded-full border-[3px] border-white" />
                <span
                  className={cn(
                    "block h-[62px] w-[62px] rounded-full bg-white transition-transform",
                    capturing ? "scale-90" : "group-active:scale-90",
                  )}
                />
              </button>

              <div className="flex flex-col items-center gap-1">
                <div className="flex gap-2">
                  {torchSupported && (
                    <button
                      onClick={toggleTorch}
                      className={cn(
                        "grid h-11 w-11 place-items-center rounded-full",
                        torch ? "bg-white text-black" : "bg-white/10 hover:bg-white/20",
                      )}
                      aria-label="Toggle flash"
                    >
                      {torch ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
                    </button>
                  )}
                  <button
                    disabled={countdown !== null}
                    onClick={flipCamera}
                    className="grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                    aria-label="Flip camera"
                  >
                    <RefreshCw className="h-5 w-5" />
                  </button>
                </div>
                <span className="text-[10px] opacity-60">@{guestName || "guest"}</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
