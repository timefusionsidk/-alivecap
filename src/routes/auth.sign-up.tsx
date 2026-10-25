import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";
import { useAuth } from "@/lib/auth/auth-context";
import { mapAuthError } from "@/lib/auth/auth-errors";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email").max(255),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(128)
    .regex(/[a-zA-Z]/, "Include at least one letter")
    .regex(/[0-9]/, "Include at least one number"),
});

export const Route = createFileRoute("/auth/sign-up")({
  head: () => ({
    meta: [
      { title: "Create account — alivecap" },
      {
        name: "description",
        content: "Create your alivecap account and host your first event in minutes.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();
  const { signUp, isAuthenticated, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [google, setGoogle] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const inFlight = useRef(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "" },
  });

  useEffect(() => {
    if (!loading && isAuthenticated && !verifyEmail) navigate({ to: "/dashboard", replace: true });
  }, [loading, isAuthenticated, verifyEmail, navigate]);

  async function onSubmit(values: z.infer<typeof schema>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setFormError(null);
    const result = await signUp(values.email, values.password, values.name);
    inFlight.current = false;
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.error);
      toast.error(result.error);
      return;
    }
    if (result.needsEmailVerification) {
      setVerifyEmail(values.email.trim());
      toast.success("Check your email to verify your account.");
      return;
    }
    toast.success("Account created — welcome to alivecap");
    navigate({ to: "/dashboard", replace: true });
  }

  async function onGoogle() {
    if (google) return;
    setGoogle(true);
    setFormError(null);
    try {
      const result = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent("/dashboard")}`,
        },
      });
      if (result.error) throw result.error;
      if (result.data.url) return;
      navigate({ to: "/dashboard", replace: true });
    } catch (e) {
      setGoogle(false);
      const msg = mapAuthError(e);
      setFormError(msg);
      toast.error(msg);
    }
  }

  if (verifyEmail) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`We sent a verification link to ${verifyEmail}.`}
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <MailCheck className="h-10 w-10 text-primary" />
          <p className="text-sm text-muted-foreground">
            Check your email to verify your account. Once verified, you can sign in and start
            hosting events.
          </p>
          <Button asChild className="w-full">
            <Link to="/auth/login" search={{ redirect: undefined }}>
              Go to sign in
            </Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  const busy = submitting || google;

  return (
    <AuthShell title="Create your account" subtitle="Free during launch. Host unlimited events.">
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
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" disabled={busy} {...form.register("name")} />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            disabled={busy}
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              At least 8 characters, with a letter and a number.
            </p>
          )}
        </div>
        {formError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {formError}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          to="/auth/login"
          search={{ redirect: undefined }}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
