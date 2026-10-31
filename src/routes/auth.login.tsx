import { CaptchaChallenge } from "@/components/auth/captcha-challenge";
import { useAuthCaptcha } from "@/lib/auth/use-auth-captcha";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";
import { useAuth } from "@/lib/auth/auth-context";
import { sanitizeRedirect } from "@/lib/auth/redirect";
import { mapAuthError } from "@/lib/auth/auth-errors";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email").max(255),
  password: z.string().min(1, "Password is required").max(128),
});

export const Route = createFileRoute("/auth/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — alivecap" },
      { name: "description", content: "Sign in to manage your alivecap events." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const target = sanitizeRedirect(search.redirect);
  const { signIn, isAuthenticated, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [google, setGoogle] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const captcha = useAuthCaptcha();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  // Already signed in? Never render the form — go straight through (no loop).
  useEffect(() => {
    if (!loading && isAuthenticated) navigate({ to: target, replace: true });
  }, [loading, isAuthenticated, target, navigate]);

  async function onSubmit(values: z.infer<typeof schema>) {
    if (inFlight.current || !captcha.ready) return;
    inFlight.current = true;
    setSubmitting(true);
    setFormError(null);
    const result = await signIn(values.email, values.password, captcha.token ?? undefined);
    inFlight.current = false;
    captcha.reset();
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success("Welcome back");
    navigate({ to: target, replace: true });
  }

  async function onGoogle() {
    if (google) return;
    setGoogle(true);
    setFormError(null);
    try {
      const result = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(target)}`,
        },
      });
      if (result.error) throw result.error;
      if (result.data.url) return;
      navigate({ to: target, replace: true });
    } catch (e) {
      setGoogle(false);
      const msg = mapAuthError(e);
      setFormError(msg);
      toast.error(msg);
    }
  }

  const busy = submitting || google;

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your alivecap dashboard.">
      <Button type="button" variant="outline" className="w-full" onClick={onGoogle} disabled={busy}>
        {google ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Camera className="mr-2 h-4 w-4" />
        )}
        Continue with Google
      </Button>
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
      </div>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            disabled={busy}
            {...form.register("email")}
          />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/auth/forgot-password"
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Forgot?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            disabled={busy}
            {...form.register("password")}
          />
          {form.formState.errors.password && (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          )}
        </div>
        <CaptchaChallenge
          key={captcha.generation}
          config={captcha.config}
          onToken={captcha.setToken}
        />
        {formError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {formError}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={busy || !captcha.ready}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link
          to="/auth/sign-up"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
