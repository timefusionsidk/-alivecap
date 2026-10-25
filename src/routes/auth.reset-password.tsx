import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";
import { useAuth } from "@/lib/auth/auth-context";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(128)
      .regex(/[a-zA-Z]/, "Include at least one letter")
      .regex(/[0-9]/, "Include at least one number"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

export const Route = createFileRoute("/auth/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set new password — alivecap" },
      { name: "description", content: "Set a new password for your alivecap account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const { updatePassword, signOut, isAuthenticated, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [linkChecked, setLinkChecked] = useState(false);
  const inFlight = useRef(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  // Supabase exchanges the recovery link for a session on load; give it a beat.
  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) {
      setLinkChecked(true);
      return;
    }
    const t = setTimeout(() => setLinkChecked(true), 1200);
    return () => clearTimeout(t);
  }, [authLoading, isAuthenticated]);

  async function onSubmit(values: z.infer<typeof schema>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setFormError(null);
    const result = await updatePassword(values.password);
    inFlight.current = false;
    setLoading(false);
    if (!result.ok) {
      setFormError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success("Password updated — please sign in");
    await signOut();
    navigate({ to: "/auth/login", search: { redirect: undefined }, replace: true });
  }

  if (authLoading || !linkChecked) {
    return (
      <AuthShell title="Checking your link" subtitle="One moment.">
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AuthShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthShell title="This link has expired" subtitle="Reset links are single-use and expire after one hour.">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="h-9 w-9 text-destructive" />
          <p className="text-sm text-muted-foreground">Request a new reset link to continue.</p>
          <Button asChild className="w-full"><Link to="/auth/forgot-password">Request a new link</Link></Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose something you'll remember.">
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" autoComplete="new-password" disabled={loading} {...form.register("password")} />
          {form.formState.errors.password && <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" disabled={loading} {...form.register("confirm")} />
          {form.formState.errors.confirm && <p className="text-xs text-destructive">{form.formState.errors.confirm.message}</p>}
        </div>
        {formError && (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {formError}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update password
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/auth/login" search={{ redirect: undefined }} className="font-medium text-foreground underline underline-offset-4">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
