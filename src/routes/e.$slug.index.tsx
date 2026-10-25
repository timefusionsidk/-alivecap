import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getCurrentGuest } from "@/lib/guest/guest.functions";
import { useGuestSession } from "@/lib/guest/use-guest";

export const Route = createFileRoute("/e/$slug/")({
  ssr: false,
  component: EventGate,
});

function EventGate() {
  const { slug } = Route.useParams();
  const { token, hydrated } = useGuestSession();
  const currentGuest = useServerFn(getCurrentGuest);

  const q = useQuery({
    queryKey: ["current-guest", token],
    queryFn: () => currentGuest(),
    enabled: !!token,
  });

  if (!hydrated || (token && q.isLoading)) {
    return (
      <main className="grid min-h-dvh place-items-center bg-black">
        <Loader2 className="h-6 w-6 animate-spin text-white/70" />
      </main>
    );
  }
  if (!token) return <Navigate to="/join/$slug" params={{ slug }} replace />;
  if (!q.data?.ok || q.data.event.slug !== slug) {
    return <Navigate to="/join/$slug" params={{ slug }} replace />;
  }
  return <Navigate to="/e/$slug/gallery" params={{ slug }} replace />;
}