import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera, CameraOff, ArrowLeft, RefreshCw, Download, Trash2, SwitchCamera,
  CheckCircle2, AlertTriangle, XCircle, ChevronDown, Zap, FlipHorizontal2, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/camera-check")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Camera check — alivecap" },
      { name: "description", content: "Verify your camera, permissions and device capabilities before hosting an event." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CameraCheckPage,
});

type Check = { label: string; state: "pass" | "warn" | "fail" | "idle"; detail?: string };
type Grade = "Excellent" | "Good" | "Fair" | "Poor";

function grade(ms: number, thresholds: [number, number, number]): Grade {
  if (ms <= thresholds[0]) return "Excellent";
  if (ms <= thresholds[1]) return "Good";
  if (ms <= thresholds[2]) return "Fair";
  return "Poor";
}

function gradeFps(fps: number): Grade {
  if (fps >= 50) return "Excellent";
  if (fps >= 28) return "Good";
  if (fps >= 18) return "Fair";
  return "Poor";
}

function browserName() {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Unknown";
}

function platformName() {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}

function friendlyError(err: unknown): { title: string; message: string } {
  const e = err as { name?: string; message?: string };
  switch (e?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return { title: "Permission denied", message: "Camera access is required to test your device." };
    case "NotFoundError":
    case "OverconstrainedError":
      return { title: "No camera detected", message: "We couldn't find a camera matching the requested settings. Try switching cameras." };
    case "NotReadableError":
    case "TrackStartError":
      return { title: "Camera in use", message: "Another application (or browser tab) is using the camera. Close it and retry." };
    case "AbortError":
      return { title: "Stream interrupted", message: "The camera stream was interrupted. Please retry." };
    default:
      return { title: "Failed to initialise camera", message: e?.message || "An unknown camera error occurred." };
  }
}

function StateIcon({ state }: { state: Check["state"] }) {
  if (state === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (state === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (state === "fail") return <XCircle className="h-4 w-4 text-destructive" />;
  return <span className="h-4 w-4 rounded-full border border-border" />;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

function YesNo({ v }: { v: boolean }) {
  return <span className={v ? "text-emerald-500" : "text-muted-foreground"}>{v ? "✅ Yes" : "❌ No"}</span>;
}

function GradeBadge({ g }: { g: Grade }) {
  const cls =
    g === "Excellent" ? "bg-emerald-500/15 text-emerald-500"
    : g === "Good" ? "bg-primary/15 text-primary"
    : g === "Fair" ? "bg-amber-500/15 text-amber-500"
    : "bg-destructive/15 text-destructive";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{g}</span>;
}

const card = "rounded-3xl border border-border bg-card/60 p-6 shadow-sm backdrop-blur-xl";

function CameraCheckPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [status, setStatus] = useState<"idle" | "starting" | "live" | "error">("idle");
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [mirror, setMirror] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const [settings, setSettings] = useState<MediaTrackSettings | null>(null);
  const [caps, setCaps] = useState<MediaTrackCapabilities | null>(null);
  const [deviceLabel, setDeviceLabel] = useState<string>("Unknown");
  const [deviceCount, setDeviceCount] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const [torchOn, setTorchOn] = useState(false);

  const [startupMs, setStartupMs] = useState<number | null>(null);
  const [captureMs, setCaptureMs] = useState<number | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [memoryMb, setMemoryMb] = useState<number | null>(null);

  const [photo, setPhoto] = useState<string | null>(null);
  const [captureOk, setCaptureOk] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied" | "prompt">("unknown");
  const [flash, setFlash] = useState(false);
  const [online, setOnline] = useState(true);

  const log = useCallback((line: string) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[camera-check]", line);
    }
  }, []);

  const supportsGUM = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const supportsImageCapture = typeof window !== "undefined" && "ImageCapture" in window;
  const secure = typeof window !== "undefined" ? window.isSecureContext : true;

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await (navigator.permissions as never as { query: (d: { name: string }) => Promise<PermissionStatus> })
          ?.query?.({ name: "camera" });
        if (p && !cancelled) {
          setPermission(p.state as typeof permission);
          p.onchange = () => setPermission(p.state as typeof permission);
        }
      } catch { /* Firefox/Safari don't support the camera permission name */ }
      try {
        const devs = await navigator.mediaDevices?.enumerateDevices?.();
        if (devs && !cancelled) setDeviceCount(devs.filter((d) => d.kind === "videoinput").length);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stop(), [stop]);

  const measureFps = useCallback(() => {
    let frames = 0;
    const started = performance.now();
    const tick = () => {
      frames += 1;
      const elapsed = performance.now() - started;
      if (elapsed >= 1500) {
        setFps(Math.round((frames / elapsed) * 1000));
        frames = 0;
        const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        if (perfMem) setMemoryMb(Math.round(perfMem.usedJSHeapSize / 1048576));
        rafRef.current = requestAnimationFrame(() => measureFps());
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async (mode: "user" | "environment") => {
    setError(null);
    if (!supportsGUM) {
      setStatus("error");
      setError({ title: "Unsupported browser", message: "This browser does not support the required Camera API." });
      return;
    }
    if (!secure) {
      setStatus("error");
      setError({ title: "HTTPS required", message: "Camera access requires a secure (HTTPS) connection." });
      return;
    }
    setStatus("starting");
    const t0 = performance.now();
    log(`Requesting camera (${mode})`);
    stop();
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (inner) {
        log(`Preferred constraints failed (${(inner as Error).name}), retrying with any camera`);
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      setDeviceLabel(track?.label || "Camera");
      setSettings(track?.getSettings?.() ?? null);
      setCaps(track?.getCapabilities?.() ?? null);
      const c = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number } }) | undefined;
      setZoom(c?.zoom ? (track.getSettings() as { zoom?: number }).zoom ?? c.zoom.min : null);
      setTorchOn(false);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play().catch(() => undefined);
      }
      setStartupMs(Math.round(performance.now() - t0));
      setStatus("live");
      setPermission("granted");
      setFacing(mode);
      log(`Camera ready — ${track?.label || "camera"}`);
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        setDeviceCount(devs.filter((d) => d.kind === "videoinput").length);
      } catch { /* ignore */ }
      track?.addEventListener("ended", () => {
        log("Track ended — camera disconnected");
        setStatus("error");
        setError({ title: "Camera disconnected", message: "The camera stream ended unexpectedly. Reconnect the device and retry." });
      });
      measureFps();
    } catch (err) {
      const f = friendlyError(err);
      log(`Camera error — ${(err as Error).name}: ${(err as Error).message}`);
      if ((err as Error).name === "NotAllowedError") setPermission("denied");
      setError(f);
      setStatus("error");
    }
  }, [log, measureFps, secure, stop, supportsGUM]);

  const applyConstraint = useCallback(async (c: Record<string, unknown>) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [c] } as MediaTrackConstraints);
      setSettings(track.getSettings());
    } catch (e) {
      log(`applyConstraints failed: ${(e as Error).message}`);
    }
  }, [log]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const t0 = performance.now();
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");
      if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // In-memory only: never uploaded, never persisted.
      setPhoto(canvas.toDataURL("image/jpeg", 0.92));
      setCaptureMs(Math.round(performance.now() - t0));
      setCaptureOk(true);
      log(`Captured test photo ${canvas.width}×${canvas.height}`);
    } catch (e) {
      setCaptureOk(false);
      log(`Capture failed: ${(e as Error).message}`);
    }
  }, [log, mirror]);

  const capsAny = caps as (MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number }; torch?: boolean; focusMode?: string[] }) | null;
  const supportedConstraints = typeof navigator !== "undefined" && navigator.mediaDevices?.getSupportedConstraints
    ? navigator.mediaDevices.getSupportedConstraints() as Record<string, boolean>
    : {};
  const supportsZoom = !!capsAny?.zoom;
  const supportsTorch = !!capsAny?.torch;
  const supportsFocus = !!capsAny?.focusMode?.length;
  const width = settings?.width ?? 0;
  const height = settings?.height ?? 0;
  const ratio = width && height ? (width / height).toFixed(2) : "—";

  const checks: Check[] = [
    { label: "Camera detected", state: deviceCount > 0 ? "pass" : status === "live" ? "pass" : "warn", detail: `${deviceCount} device(s)` },
    { label: "Camera permission", state: permission === "granted" ? "pass" : permission === "denied" ? "fail" : "warn", detail: permission },
    { label: "Video stream", state: status === "live" ? "pass" : status === "error" ? "fail" : "idle" },
    { label: "Capture works", state: captureOk === true ? "pass" : captureOk === false ? "fail" : "idle" },
    { label: "Image rendering", state: photo ? "pass" : "idle" },
    { label: "Resolution", state: height >= 720 ? "pass" : height > 0 ? "warn" : "idle", detail: width ? `${width}×${height}` : undefined },
    { label: "Browser compatibility", state: supportsGUM ? "pass" : "fail", detail: browserName() },
    { label: "HTTPS requirement", state: secure ? "pass" : "fail" },
  ];

  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Dashboard</Link>
          </Button>
          <Badge variant="secondary" className="capitalize">
            {status === "live" ? "Connected" : status === "starting" ? "Connecting" : status === "error" ? "Error" : "Not connected"}
          </Badge>
        </div>
      </header>

      <section className="w-full px-4 py-10">
        <h1 className="font-display text-4xl tracking-tight">Camera check</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">Verify that your camera is working correctly before your event. Nothing is uploaded — everything stays in your browser.</p>

        <div className="mt-8 grid gap-6">
          {/* Preview */}
          <div className={card}>
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black/80">
              {status === "starting" && (
                <div className="absolute inset-0 z-10 grid place-items-center gap-3 bg-black/60">
                  <Skeleton className="absolute inset-0 rounded-none opacity-20" />
                  <Loader2 className="relative h-6 w-6 animate-spin text-white" />
                </div>
              )}

              {photo ? (
                <img src={photo} alt="Camera check preview frame" className="h-full w-full object-contain animate-in fade-in duration-300" />
              ) : (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="h-full w-full object-cover transition-transform"
                  style={{ transform: mirror ? "scaleX(-1)" : undefined, opacity: status === "live" ? 1 : 0 }}
                />
              )}

              {status !== "live" && !photo && (
                <div className="absolute inset-0 grid place-items-center overflow-y-auto p-4 text-center">
                  <div>
                    {status === "error" ? <CameraOff className="mx-auto h-10 w-10 text-white/70" /> : <Camera className="mx-auto h-10 w-10 text-white/70" />}
                    <p className="mt-4 text-sm uppercase tracking-widest text-white/60">Camera status</p>
                    <p className="font-display text-2xl text-white">{status === "error" ? error?.title ?? "Error" : "Not Connected"}</p>
                    {error && <p className="mx-auto mt-2 max-w-sm text-sm text-white/70">{error.message}</p>}
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                      <Button onClick={() => start(facing)} disabled={status === "starting"}>
                        {status === "error" ? <><RefreshCw className="mr-2 h-4 w-4" /> Retry</> : <><Camera className="mr-2 h-4 w-4" /> Enable Camera</>}
                      </Button>
                      {status === "error" && (
                        <Button variant="secondary" onClick={() => setShowGuide((s) => !s)}>Open Browser Settings Guide</Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {showGuide && (
              <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">How to re-enable camera access</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li><strong>Chrome / Edge:</strong> click the icon left of the address bar → Site settings → Camera → Allow, then reload.</li>
                  <li><strong>Firefox:</strong> click the padlock → Connection settings → clear the blocked Camera permission, then reload.</li>
                  <li><strong>Safari (macOS):</strong> Safari → Settings for This Website → Camera → Allow.</li>
                  <li><strong>iPhone Safari:</strong> Settings → Safari → Camera → Allow, then reload the page.</li>
                  <li><strong>Android Chrome:</strong> tap ⋮ → Site settings → Camera → Allow.</li>
                </ul>
              </div>
            )}

            {/* Controls */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button onClick={capture} disabled={status !== "live" || !!photo}>
                <Camera className="mr-2 h-4 w-4" /> Capture test photo
              </Button>
              <Button variant="outline" onClick={() => start(facing === "user" ? "environment" : "user")} disabled={status === "starting"}>
                <SwitchCamera className="mr-2 h-4 w-4" /> Switch camera
              </Button>
              <Button
                variant="outline"
                disabled={!supportsTorch || status !== "live"}
                onClick={() => { const next = !torchOn; setTorchOn(next); applyConstraint({ torch: next }); }}
              >
                <Zap className="mr-2 h-4 w-4" /> {supportsTorch ? (torchOn ? "Torch off" : "Torch on") : "No flash"}
              </Button>
              <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5">
                <FlipHorizontal2 className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="mirror" className="text-sm">Mirror</Label>
                <Switch id="mirror" checked={mirror} onCheckedChange={setMirror} />
              </div>
              {status === "live" && (
                <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5">
                  <Label htmlFor="flashhint" className="text-sm">Screen flash</Label>
                  <Switch id="flashhint" checked={flash} onCheckedChange={setFlash} />
                </div>
              )}
            </div>

            {supportsZoom && capsAny?.zoom && status === "live" && (
              <div className="mt-4">
                <Label className="text-sm text-muted-foreground">Zoom · {zoom?.toFixed(1)}×</Label>
                <Slider
                  className="mt-2"
                  min={capsAny.zoom.min}
                  max={capsAny.zoom.max}
                  step={capsAny.zoom.step || 0.1}
                  value={[zoom ?? capsAny.zoom.min]}
                  onValueChange={([v]) => { setZoom(v); applyConstraint({ zoom: v }); }}
                />
              </div>
            )}

            {supportsFocus && status === "live" && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Focus mode:</span>
                {capsAny?.focusMode?.map((m) => (
                  <Button key={m} size="sm" variant={(settings as { focusMode?: string })?.focusMode === m ? "default" : "outline"} onClick={() => applyConstraint({ focusMode: m })}>
                    {m}
                  </Button>
                ))}
              </div>
            )}

            {photo && (
              <div className="mt-5 flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => { setPhoto(null); log("Retake"); }}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Retake
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = photo;
                    a.download = `camera-check-${Date.now()}.jpg`;
                    a.click();
                    log("Downloaded test photo");
                  }}
                >
                  <Download className="mr-2 h-4 w-4" /> Download
                </Button>
                <Button variant="ghost" className="text-destructive" onClick={() => { setPhoto(null); setCaptureOk(null); log("Deleted test photo"); }}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </div>
            )}
          </div>

          {/* Diagnostics */}
          <div className="space-y-6">
            <div className={card}>
              <h2 className="font-display text-2xl">Device information</h2>
              <div className="mt-3">
                <Row k="Camera connected" v={<YesNo v={status === "live"} />} />
                <Row k="Permission" v={permission === "granted" ? "✅ Granted" : permission === "denied" ? "❌ Denied" : "⏳ Not requested"} />
                <Row k="Camera name" v={deviceLabel} />
                <Row k="Facing mode" v={(settings as { facingMode?: string })?.facingMode ?? facing} />
                <Row k="Resolution" v={width ? `${width} × ${height}` : "—"} />
                <Row k="Aspect ratio" v={ratio} />
                <Row k="FPS" v={settings?.frameRate ? Math.round(settings.frameRate) : fps ?? "—"} />
                <Row k="Browser" v={browserName()} />
                <Row k="Platform" v={platformName()} />
                <Row k="Connection" v={online ? "Online" : "Offline"} />
              </div>
            </div>

            <div className={card}>
              <h2 className="font-display text-2xl">Quality tests</h2>
              <ul className="mt-3 space-y-2">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2"><StateIcon state={c.state} /> {c.label}</span>
                    <span className="text-muted-foreground">{c.detail ?? ""}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={card}>
              <h2 className="font-display text-2xl">Performance</h2>
              <div className="mt-3">
                <Row k="Camera startup" v={startupMs != null ? <span className="inline-flex items-center gap-2">{startupMs} ms <GradeBadge g={grade(startupMs, [400, 900, 2000])} /></span> : "—"} />
                <Row k="Preview FPS" v={fps != null ? <span className="inline-flex items-center gap-2">{fps} <GradeBadge g={gradeFps(fps)} /></span> : "—"} />
                <Row k="Capture latency" v={captureMs != null ? <span className="inline-flex items-center gap-2">{captureMs} ms <GradeBadge g={grade(captureMs, [50, 150, 400])} /></span> : "—"} />
                <Row k="Memory estimate" v={memoryMb != null ? `${memoryMb} MB` : "Not reported"} />
              </div>
            </div>

            <div className={card}>
              <h2 className="font-display text-2xl">Supported features</h2>
              <div className="mt-3">
                <Row k="Flash / Torch" v={<YesNo v={supportsTorch} />} />
                <Row k="Zoom" v={<YesNo v={supportsZoom} />} />
                <Row k="Focus" v={<YesNo v={supportsFocus} />} />
                <Row k="HDR" v={<YesNo v={!!supportedConstraints.whiteBalanceMode} />} />
                <Row k="Multiple cameras" v={<YesNo v={deviceCount > 1} />} />
                <Row k="MediaDevices API" v={<YesNo v={supportsGUM} />} />
                <Row k="ImageCapture API" v={<YesNo v={supportsImageCapture} />} />
              </div>
            </div>
          </div>
        </div>

      </section>
    </main>
  );
}