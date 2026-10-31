import { CaptchaChallenge } from "@/components/auth/captcha-challenge";
import { useAuthCaptcha } from "@/lib/auth/use-auth-captcha";
import { boundedRetrySeconds } from "@/lib/guest/rate-limit";
import { Brand } from "@/components/brand";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Camera, Loader2, Lock, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getEventPreview, joinEvent } from "@/lib/guest/guest.functions";
import { ensureGuestSession, getDeviceId, useGuestSession } from "@/lib/guest/use-guest";

const schema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(80, "Name is too long"),
  password: z.string().max(200).optional(),
});

export const Route = createFileRoute("/join/$slug")({
  head: () => ({
    meta: [
      { title: "Join the live gallery — alivecap" },
      {
        name: "description",
        content:
          "Enter your name to open the event camera and add your photos to the live shared gallery.",
      },
      { property: "og:title", content: "Join the live gallery — alivecap" },
      {
        property: "og:description",
        content:
          "Enter your name to open the event camera and add your photos to the live shared gallery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const preview = useServerFn(getEventPreview);
  const join = useServerFn(joinEvent);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const captcha = useAuthCaptcha();
  const { token: sessionUser, hydrated } = useGuestSession();
  const needsCaptcha = hydrated && !sessionUser;
  const [retryUntil, setRetryUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  const retrySeconds = Math.max(0, Math.ceil((retryUntil - now) / 1000));
  useEffect(() => {
    if (!retryUntil) return;
    const timer = setInterval(() => {
      const stamp = Date.now();
      setNow(stamp);
      if (stamp >= retryUntil) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryUntil]);
  const [fatal, setFatal] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["event-preview", slug],
    queryFn: () => preview({ data: { slug } }),
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    if (inFlight.current || Date.now() < retryUntil || (needsCaptcha && !captcha.ready)) return;
    inFlight.current = true;
    setSubmitting(true);
    setFatal(null);
    try {
      // Guests have no account: an anonymous session is what RLS authorises them with.
      const uid = await ensureGuestSession(captcha.token);
      if (!uid) {
        const msg = "Could not start a guest session. Please check your connection and try again.";
        toast.error(msg);
        setFatal(msg);
        return;
      }
      const res = await join({
        data: {
          slug,
          name: values.name,
          password: values.password || undefined,
          deviceId: getDeviceId() ?? undefined,
        },
      });
      if (!res.ok) {
        if (res.rateLimited) {
          const stamp = Date.now();
          setNow(stamp);
          setRetryUntil(stamp + boundedRetrySeconds(res.retryAfterSeconds) * 1000);
        }
        toast.error(res.error);
        setFatal(res.error);
        return;
      }
      toast.success(`Welcome, ${res.guest.name}`);
      await navigate({ to: "/e/$slug/camera", params: { slug }, replace: true });
    } catch (e) {
      const msg = (e as Error)?.message ?? "Something went wrong. Please try again.";
      toast.error(msg);
      setFatal(msg);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
      captcha.reset();
    }
  }

  if (q.isLoading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!q.data?.ok) {
    const reason =
      q.data?.error === "not_found"
        ? "We couldn't find this event."
        : q.data?.error === "closed"
          ? "This event is closed."
          : q.data?.error === "ended"
            ? "This event has ended."
            : "This event is not available.";
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-3xl">Nothing here</h1>
          <p className="mt-2 text-sm text-muted-foreground">{reason}</p>
        </div>
      </main>
    );
  }

  const event = q.data.event;

  return (
    <main className="relative min-h-dvh bg-background">
      <div className="px-6 pt-8">
        <Brand />
      </div>
      <div className="absolute inset-0 bg-hero" aria-hidden />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-auto rounded-3xl border border-border bg-card p-8 shadow-elegant"
        >
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <PartyPopper className="h-6 w-6" />
          </div>
          <h1 className="mt-6 text-center font-display text-3xl leading-tight">
            You're invited to <span className="italic text-primary">{event.name}</span>
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            {event.description ?? "Grab your camera. Every shot lands in the live gallery."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                autoComplete="given-name"
                placeholder="e.g. Alex"
                autoFocus
                {...form.register("name")}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            {event.has_password && (
              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5" /> Event password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="off"
                  {...form.register("password")}
                />
              </div>
            )}
            {needsCaptcha && (
              <CaptchaChallenge
                key={captcha.generation}
                config={captcha.config}
                onToken={captcha.setToken}
              />
            )}
            {fatal && (
              <p role="alert" className="text-xs text-destructive">
                {fatal}
              </p>
            )}
            {retrySeconds > 0 && (
              <p role="status" className="text-xs text-muted-foreground">
                Please wait {Math.ceil(retrySeconds / 60)} minute(s) before trying again.
              </p>
            )}
            <Button
              type="submit"
              className="h-12 w-full text-base"
              disabled={
                submitting || !hydrated || retrySeconds > 0 || (needsCaptcha && !captcha.ready)
              }
              aria-busy={submitting}
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-2 h-4 w-4" />
              )}
              {submitting ? "Joining…" : "Enter the camera"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By joining you agree to share your photos with the event host and other guests.
          </p>
        </motion.div>
      </div>
    </main>
  );
}
