import { publicJoinUrl } from "@/lib/public-url";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Copy,
  Download,
  Image as ImageIcon,
  Users,
  ArrowDownToLine,
  ShieldAlert,
  Package,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { getEventDetail, listEventExports, createEventExport } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/_authenticated/events/$id/")({
  head: () => ({
    meta: [{ title: "Event overview — alivecap" }, { name: "robots", content: "noindex" }],
  }),
  component: EventOverview,
});

function EventOverview() {
  const { id } = Route.useParams();
  const detail = useServerFn(getEventDetail);
  const q = useQuery({ queryKey: ["event-detail", id], queryFn: () => detail({ data: { id } }) });

  const qc = useQueryClient();
  const listExportsFn = useServerFn(listEventExports);
  const createExportFn = useServerFn(createEventExport);
  const exportsQ = useQuery({
    queryKey: ["event-exports", id],
    queryFn: () => listExportsFn({ data: { eventId: id } }),
  });
  const exportM = useMutation({
    mutationFn: () => createExportFn({ data: { eventId: id } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Bundled ${r.count} photos`);
      qc.invalidateQueries({ queryKey: ["event-exports", id] });
    },
    onError: (e: unknown) => toast.error(toUserMessage(e)),
  });

  const [qr, setQr] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string>("");

  useEffect(() => {
    if (!q.data?.ok || typeof window === "undefined") return;
    const url = publicJoinUrl(q.data.event.slug);
    setJoinUrl(url);
    QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: "#111111", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [q.data]);

  if (!q.data?.ok) return null;
  const stats = q.data.stats;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      toast.success("Join link copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <div className="overview-layout grid gap-6 grid-cols-1">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <StatCard icon={ImageIcon} label="Photos" value={stats.photos} />
          <StatCard icon={Users} label="Guests" value={stats.guests} />
          <StatCard icon={ArrowDownToLine} label="Downloads · 24h" value={stats.downloads_today} />
          <StatCard
            icon={ShieldAlert}
            label="Open reports"
            value={stats.reports_open}
            tone={stats.reports_open ? "warn" : "default"}
          />
        </div>

        <div className="rounded-3xl border border-border bg-card p-6">
          <h2 className="font-display text-2xl">How guests join</h2>
          <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>
              <span className="mr-2 font-medium text-foreground">1.</span> Print or project the QR
              to the right.
            </li>
            <li>
              <span className="mr-2 font-medium text-foreground">2.</span> Guests scan and enter
              their name{q.data.event.password_hash ? " and the event password" : ""}.
            </li>
            <li>
              <span className="mr-2 font-medium text-foreground">3.</span> They start shooting —
              every photo appears in the live gallery instantly.
            </li>
          </ol>
          <div className="mt-6 flex items-center gap-2">
            <input
              readOnly
              value={joinUrl}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <Button variant="secondary" size="sm" onClick={copyLink}>
              <Copy className="mr-2 h-4 w-4" /> Copy
            </Button>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl">Download bundle</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Package every approved photo into a single ZIP. Links expire after 1 hour, files
                stay in storage for 7 days.
              </p>
            </div>
            <Button onClick={() => exportM.mutate()} disabled={exportM.isPending}>
              {exportM.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Package className="mr-2 h-4 w-4" />
              )}
              {exportM.isPending ? "Bundling…" : "Create ZIP"}
            </Button>
          </div>
          {exportsQ.data?.ok && exportsQ.data.exports.length > 0 && (
            <ul className="mt-5 divide-y divide-border rounded-2xl border border-border/60">
              {exportsQ.data.exports.map((ex) => (
                <li
                  key={ex.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {ex.status === "ready" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : ex.status === "failed" ? (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate">{new Date(ex.created_at).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">
                        {ex.photo_count ?? 0} photos · {ex.status}
                      </p>
                    </div>
                  </div>
                  {ex.url ? (
                    <Button asChild size="sm" variant="secondary">
                      <a href={ex.url} target="_blank" rel="noreferrer">
                        <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                      </a>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside className="rounded-3xl border border-border bg-card p-6">
        <h3 className="font-display text-xl">Share QR</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Guests scan to join and start shooting.
        </p>
        <div className="mt-5 grid aspect-square place-items-center overflow-hidden rounded-2xl border border-border bg-white p-4">
          {qr ? (
            <img src={qr} alt="Join QR code" className="h-full w-full object-contain" />
          ) : (
            <div className="text-xs text-muted-foreground">Generating…</div>
          )}
        </div>
        {qr && (
          <Button asChild variant="secondary" className="mt-4 w-full">
            <a href={qr} download={`alivecap-${q.data.event.slug}.png`}>
              <Download className="mr-2 h-4 w-4" /> Download PNG
            </a>
          </Button>
        )}
      </aside>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${tone === "warn" ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card"}`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-2 font-display text-4xl">{value}</p>
    </div>
  );
}
