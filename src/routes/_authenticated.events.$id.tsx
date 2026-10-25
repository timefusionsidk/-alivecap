import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, ImageIcon, Loader2, Settings2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getEventDetail } from "@/lib/admin/admin.functions";
import { toUserMessage } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/events/$id")({
  head: () => ({ meta: [{ title: "Event — alivecap" }, { name: "robots", content: "noindex" }] }),
  component: EventLayout,
});

function EventLayout() {
  const { id } = Route.useParams();
  const detail = useServerFn(getEventDetail);
  const q = useQuery({
    queryKey: ["event-detail", id],
    queryFn: () => detail({ data: { id } }),
  });

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: `/events/${id}`, label: "Overview", icon: Sparkles, exact: true },
    { to: `/events/${id}/photos`, label: "Photos", icon: ImageIcon },
    { to: `/events/${id}/settings`, label: "Settings", icon: Settings2 },
  ];

  return (
    <main className="event-layout">
      <header className="border-b border-border">
        <div className="w-full px-4 pt-5">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Events
          </Link>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate font-display text-4xl tracking-tight">
                {q.data?.ok ? q.data.event.name : q.isLoading ? "…" : "Not found"}
              </h1>
              {q.data?.ok && (
                <div className="mt-1 text-sm text-muted-foreground">
                  /{q.data.event.slug} ·{" "}
                  <Badge
                    variant={q.data.event.status === "active" ? "default" : "secondary"}
                    className="capitalize"
                  >
                    {q.data.event.status}
                  </Badge>
                </div>
              )}
            </div>
            {q.data?.ok && (
              <a
                href={`/e/${q.data.event.slug}/gallery`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm hover:border-primary/40"
              >
                Open guest gallery <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <nav className="mt-6 flex gap-1 overflow-x-auto">
            {tabs.map((t) => {
              const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-3 text-sm transition",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="w-full px-4 py-8">
        {q.isLoading ? (
          <div className="grid place-items-center py-20" aria-busy="true">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : q.isError ? (
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <h2 className="font-display text-2xl">This event didn't load</h2>
            <p className="mt-2 text-sm text-muted-foreground">{toUserMessage(q.error)}</p>
            <Button variant="outline" className="mt-5 h-11" onClick={() => q.refetch()}>
              {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Try again"}
            </Button>
          </div>
        ) : !q.data?.ok ? (
          <div className="rounded-3xl border border-dashed border-border p-12 text-center">
            <h2 className="font-display text-2xl">Event not found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              It may have been archived or you don't have access.
            </p>
            <Button variant="outline" className="mt-5 h-11" asChild>
              <Link to="/dashboard">Back to events</Link>
            </Button>
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    </main>
  );
}
