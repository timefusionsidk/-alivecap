import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { MobileNav } from "@/components/mobile-nav";

export const Route = createFileRoute("/_authenticated")({
  // Sessions live in localStorage, so the gate must run client-side only —
  // SSR-gating here causes redirect loops on hard refresh.
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    // Guests hold anonymous sessions; they must never reach host screens.
    if (error || !data.user || data.user.is_anonymous) {
      throw redirect({
        to: "/auth/login",
        search: { redirect: location.href },
        replace: true,
      });
    }
    return { user: data.user };
  },
  component: HostLayout,
});

function HostLayout() {
  return (
    <div className="host-shell">
      <Outlet />
      <MobileNav />
    </div>
  );
}
