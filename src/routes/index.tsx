import { createFileRoute, redirect } from "@tanstack/react-router";
import { Brand } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";

/**
 * alivecap has no landing page. "/" is a thin dispatcher: signed-in hosts go
 * straight to their events, everyone else goes to sign in.
 */
export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "alivecap — live event camera" },
      {
        name: "description",
        content:
          "Open alivecap: host live event galleries or join an event camera from your phone.",
      },
      { property: "og:title", content: "alivecap — live event camera" },
      {
        property: "og:description",
        content:
          "Open alivecap: host live event galleries or join an event camera from your phone.",
      },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    // Anonymous sessions belong to event guests, not hosts.
    const isHost = !!data.user && !data.user.is_anonymous;
    throw redirect({
      to: isHost ? "/dashboard" : "/auth/login",
      search: isHost ? undefined : { redirect: undefined },
      replace: true,
    });
  },
  component: Splash,
});

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="grid h-14 w-14 animate-pulse place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Brand variant="icon" />
        </div>
        <Brand />
      </div>
    </div>
  );
}
