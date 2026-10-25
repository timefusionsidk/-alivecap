import { Brand } from "@/components/brand";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  LogOut,
  Plus,
  ImageIcon,
  Users,
  Loader2,
  ChevronRight,
  CalendarDays,
  HardDrive,
  Activity,
  QrCode,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { listMyEvents, getHostOverview } from "@/lib/admin/admin.functions";
import { useAuth } from "@/lib/auth/auth-context";
import { toUserMessage } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your events — alivecap" },
      { name: "description", content: "Manage your alivecap events, guests and live galleries." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: "easeOut" as const },
};

function Dashboard() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const listFn = useServerFn(listMyEvents);
  const overviewFn = useServerFn(getHostOverview);

  const eventsQ = useQuery({
    queryKey: ["my-events"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });
  const overviewQ = useQuery({
    queryKey: ["host-overview"],
    queryFn: () => overviewFn(),
    staleTime: 30_000,
  });

  async function onSignOut() {
    setSigningOut(true);
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await signOut();
      toast.success("Signed out");
      navigate({ to: "/auth/login", search: { redirect: undefined }, replace: true });
    } catch (e) {
      toast.error(toUserMessage(e, "We couldn't sign you out. Please try again."));
    } finally {
      setSigningOut(false);
      setConfirmSignOut(false);
    }
  }

  const totals = overviewQ.data?.totals;
  const events = eventsQ.data?.events ?? [];

  return (
    <main className="editorial-page">
      <header className="dashboard-header">
        <Brand />
        <div className="flex items-center gap-3">
          <p>{overviewQ.data?.account.name || user.email}</p>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmSignOut(true)}
            aria-label="Sign out"
          >
            <LogOut />
          </Button>
        </div>
      </header>
      <section>
        <h1>Your events</h1>
        <p className="editorial-subtitle">
          Every guest, every angle, in one live gallery. Pick an event to watch it fill up.
        </p>
        {/* Overview — every number comes from the database */}
        <motion.div {...fade} className="stats-strip">
          {overviewQ.isLoading ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
            ))
          ) : overviewQ.isError ? (
            <div className="col-span-2 rounded-2xl border border-border bg-card p-4 text-center">
              <p className="text-sm text-muted-foreground">
                {toUserMessage(overviewQ.error, "We couldn't load your overview.")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-10"
                onClick={() => overviewQ.refetch()}
              >
                {overviewQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Try again"}
              </Button>
            </div>
          ) : totals ? (
            <>
              <Metric
                icon={CalendarDays}
                label="Events"
                value={totals.events}
                hint={`${totals.active_events} live`}
              />
              <Metric icon={ImageIcon} label="Photos" value={totals.photos} />
              <Metric icon={Users} label="Guests" value={totals.guests} />
              <Metric
                icon={HardDrive}
                label="Storage"
                value={formatMb(totals.storage_used_mb)}
                hint={
                  totals.storage_limit_mb ? `of ${formatMb(totals.storage_limit_mb)}` : undefined
                }
              />
            </>
          ) : null}
        </motion.div>

        <div className="event-list-toolbar">
          <h2>Events</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/camera-check">
                <Camera className="h-4 w-4" /> Camera check
              </Link>
            </Button>
            <Button asChild>
              <Link to="/events/new">
                <Plus className="h-4 w-4" /> New event
              </Link>
            </Button>
          </div>
        </div>
        {/* Events */}
        <h2 className="mt-7 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          All events
        </h2>

        {eventsQ.isLoading ? (
          <div className="mt-3 space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-3xl bg-muted" />
            ))}
          </div>
        ) : eventsQ.isError ? (
          <div className="mt-3 rounded-3xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {toUserMessage(eventsQ.error, "We couldn't load your events.")}
            </p>
            <Button variant="outline" className="mt-4 h-11" onClick={() => eventsQ.refetch()}>
              {eventsQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Try again"}
            </Button>
          </div>
        ) : !events.length ? (
          <div className="mt-3 rounded-3xl border border-dashed border-border bg-card/40 p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Camera className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="mt-5 font-display text-2xl">No events yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Create your first event and share the join link with your guests.
            </p>
            <Button className="mt-5 h-11" asChild>
              <Link to="/events/new">
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Create an event
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {events.map((e) => (
              <li key={e.id}>
                <Link to="/events/$id" params={{ id: e.id }} className="event-row">
                  <div className="event-row-top">
                    <div className="min-w-0">
                      <p className="event-row-title">{e.name}</p>
                      <p className="event-row-meta">
                        {e.event_date
                          ? new Date(`${e.event_date}T12:00:00`).toLocaleDateString(undefined, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "Date to be announced"}
                        {e.venue ? ` · ${e.venue}` : ""} · {e.photo_count} photos · {e.guest_count}{" "}
                        guests
                      </p>
                    </div>
                    <span className="event-status" data-status={e.status}>
                      {e.status}
                    </span>
                  </div>
                  <div className="photo-strip">
                    {e.thumbnails.map((url, i) => (
                      <img key={i} src={url} alt="" loading="lazy" />
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Recent activity — only rendered when real activity exists */}
        {overviewQ.data?.activity.length ? (
          <motion.section {...fade} className="mt-7">
            <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <Activity className="h-3.5 w-3.5" aria-hidden="true" /> Recent activity
            </h2>
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {overviewQ.data.activity.map((a) => (
                <li key={a.event_id}>
                  <Link
                    to="/events/$id"
                    params={{ id: a.event_id }}
                    className="flex items-center justify-between gap-3 px-4 py-3 active:bg-accent/10"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.event_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.photos} photos · {a.guests} guests · {relativeTime(a.at)}
                      </p>
                    </div>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </motion.section>
        ) : null}

        {/* Account */}
        {overviewQ.data ? (
          <section id="account" className="mt-8 rounded-2xl border border-border bg-card/60 p-4">
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Account
            </h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Signed in as</dt>
                <dd className="truncate">{overviewQ.data.account.email ?? user.email}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="capitalize">{overviewQ.data.account.plan}</dd>
              </div>
              {overviewQ.data.account.member_since ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Host since</dt>
                  <dd>{new Date(overviewQ.data.account.member_since).toLocaleDateString()}</dd>
                </div>
              ) : null}
            </dl>
            <Button
              variant="outline"
              className="mt-4 h-11 w-full"
              onClick={() => setConfirmSignOut(true)}
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sign out
            </Button>
          </section>
        ) : null}
      </section>

      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent className="max-w-[92vw] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of alivecap?</AlertDialogTitle>
            <AlertDialogDescription>
              Your events and photos stay safe. You'll need to sign in again to manage them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Stay signed in</AlertDialogCancel>
            <AlertDialogAction
              className="h-11"
              disabled={signingOut}
              onClick={(e) => {
                e.preventDefault();
                if (!signingOut) void onSignOut();
              }}
            >
              {signingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="stat-cell">
      <div className="metric-label">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
      </div>
      <p className="metric-value">{value}</p>
      {hint ? <p className="metric-hint">{hint}</p> : null}
    </div>
  );
}

function formatMb(mb: number): string {
  if (!mb) return "0 MB";
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} GB`;
  return `${Math.round(mb)} MB`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
