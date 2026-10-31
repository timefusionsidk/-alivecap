import { CaptchaChallenge } from "@/components/auth/captcha-challenge";
import { useAuthCaptcha } from "@/lib/auth/use-auth-captcha";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";
import { useAuth } from "@/lib/auth/auth-context";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email").max(255),
});

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — alivecap" },
      { name: "description", content: "Get a password reset link for your alivecap account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPage,
});

function ForgotPage() {
  const { resetPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const captcha = useAuthCaptcha();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    if (inFlight.current || !captcha.ready) return;
    inFlight.current = true;
    setLoading(true);
    setFormError(null);
    const result = await resetPassword(values.email, captcha.token ?? undefined);
    inFlight.current = false;
    captcha.reset();
    setLoading(false);
    if (!result.ok) {
      setFormError(result.error);
      toast.error(result.error);
      return;
    }
    setSent(true);
    toast.success("Check your inbox for the reset link");
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to set a new one.">
      {sent ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-secondary/50 p-5 text-center text-sm text-secondary-foreground">
          <MailCheck className="h-8 w-8 text-primary" />
          If an account exists for that address, a reset link is on its way. The link expires in one
          hour.
        </div>
      ) : (
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              disabled={loading}
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
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
          <Button type="submit" className="w-full" disabled={loading || !captcha.ready}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link
          to="/auth/login"
          search={{ redirect: undefined }}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
