import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { sanitizeRedirect } from "@/lib/auth/redirect";
import { useAuth } from "@/lib/auth/auth-context";
import { AuthShell } from "@/components/auth/auth-shell";

/** Public landing target for email-verification and OAuth returns. */
export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ redirect: sanitizeRedirect(s.redirect) }),
  head: () => ({
    meta: [
      { title: "Signing you in — alivecap" },
      { name: "description", content: "Completing your alivecap sign-in." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CallbackPage,
});

function CallbackPage() {
  const navigate = useNavigate();
  const { redirect: target } = Route.useSearch();
  const { loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (loading) return;
    navigate(
      isAuthenticated
        ? { to: target, replace: true }
        : { to: "/auth/login", search: {}, replace: true },
    );
  }, [loading, isAuthenticated, navigate, target]);

  return (
    <AuthShell title="Signing you in" subtitle="One moment while we confirm your session.">
      <div className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </AuthShell>
  );
}
