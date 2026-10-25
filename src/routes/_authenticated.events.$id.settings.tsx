import { JoinCard } from "@/components/join-card";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { AlertTriangle, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { archiveEvent, getEventDetail, updateEvent } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/_authenticated/events/$id/settings")({
  head: () => ({
    meta: [{ title: "Event settings — alivecap" }, { name: "robots", content: "noindex" }],
  }),
  component: SettingsPage,
});

type FormValues = {
  name: string;
  description: string;
  venue: string;
  event_date: string;
  password: string;
  passwordChanged: boolean;
  status: "draft" | "active" | "archived";
  allow_uploads: boolean;
  allow_downloads: boolean;
  allow_comments: boolean;
  allow_likes: boolean;
  show_exif: boolean;
  allow_videos: boolean;
};

function SettingsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const detail = useServerFn(getEventDetail);
  const update = useServerFn(updateEvent);
  const archive = useServerFn(archiveEvent);

  const q = useQuery({ queryKey: ["event-detail", id], queryFn: () => detail({ data: { id } }) });
  const e = q.data?.ok ? q.data.event : null;

  const [pwEditing, setPwEditing] = useState(false);
  const form = useForm<FormValues>({
    values: e
      ? {
          name: e.name ?? "",
          description: e.description ?? "",
          venue: e.venue ?? "",
          event_date: e.event_date ?? "",
          password: "",
          passwordChanged: false,
          status: (e.status as "draft" | "active" | "archived") ?? "active",
          allow_uploads: e.allow_uploads,
          allow_downloads: e.allow_downloads,
          allow_comments: e.allow_comments,
          allow_likes: e.allow_likes,
          show_exif: e.show_exif,
          allow_videos: e.allow_videos,
        }
      : undefined,
  });

  const saveM = useMutation({
    mutationFn: (v: FormValues) =>
      update({
        data: {
          id,
          name: v.name || undefined,
          description: v.description === "" ? null : v.description,
          venue: v.venue === "" ? null : v.venue,
          event_date: v.event_date === "" ? null : v.event_date,
          password: v.passwordChanged ? (v.password === "" ? null : v.password) : undefined,
          status: v.status,
          allow_uploads: v.allow_uploads,
          allow_downloads: v.allow_downloads,
          allow_comments: v.allow_comments,
          allow_likes: v.allow_likes,
          show_exif: v.show_exif,
          allow_videos: v.allow_videos,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setPwEditing(false);
      form.setValue("password", "");
      form.setValue("passwordChanged", false);
      qc.invalidateQueries({ queryKey: ["event-detail", id] });
      qc.invalidateQueries({ queryKey: ["my-events"] });
    },
    onError: (er: unknown) => toast.error(toUserMessage(er)),
  });

  const archiveM = useMutation({
    mutationFn: () => archive({ data: { id } }),
    onSuccess: () => {
      toast.success("Event archived");
      qc.invalidateQueries({ queryKey: ["my-events"] });
      navigate({ to: "/dashboard" });
    },
    onError: (er: unknown) => toast.error(toUserMessage(er)),
  });

  if (!e)
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="settings-layout">
      <form
        onSubmit={form.handleSubmit((v) => saveM.mutate(v))}
        className="settings-form"
        noValidate
      >
        <Section title="Details">
          <div>
            <Label htmlFor="name">Event name</Label>
            <Input id="name" {...form.register("name")} className="mt-2" />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={3}
              {...form.register("description")}
              className="mt-2"
            />
          </div>
          <div className="grid gap-4">
            <div>
              <Label htmlFor="venue">Venue</Label>
              <Input id="venue" {...form.register("venue")} className="mt-2" />
            </div>
            <div>
              <Label htmlFor="event_date">Date</Label>
              <Input
                id="event_date"
                type="date"
                {...form.register("event_date")}
                className="mt-2"
              />
            </div>
          </div>
        </Section>

        <Section title="Access">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background/50 p-4">
            <div>
              <p className="text-sm font-medium">Status</p>
              <p className="text-xs text-muted-foreground">
                Active is ready for guests. Archived closes guest access. Draft retains the current
                backend access rules.
              </p>
            </div>
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              {...form.register("status")}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Password</p>
                <p className="text-xs text-muted-foreground">
                  {e.password_hash
                    ? "A password is set."
                    : "This event is open — no password required."}
                </p>
              </div>
              {!pwEditing && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setPwEditing(true);
                    form.setValue("passwordChanged", true);
                  }}
                >
                  {e.password_hash ? "Change" : "Add"}
                </Button>
              )}
            </div>
            {pwEditing && (
              <div className="mt-3 flex items-center gap-2">
                <Input
                  type="password"
                  aria-label="New event password"
                  autoComplete="new-password"
                  placeholder="New password (leave empty to remove)"
                  {...form.register("password")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPwEditing(false);
                    form.setValue("passwordChanged", false);
                    form.setValue("password", "");
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </Section>

        <Section title="Guest permissions">
          <Toggle
            label="Allow uploads"
            description="Guests can post new photos."
            name="allow_uploads"
            form={form}
          />
          <Toggle
            label="Allow downloads"
            description="Guests can save photos."
            name="allow_downloads"
            form={form}
          />
          <Toggle
            label="Allow comments"
            description="Guests can leave notes on photos."
            name="allow_comments"
            form={form}
          />
          <Toggle
            label="Allow likes"
            description="Guests can heart photos."
            name="allow_likes"
            form={form}
          />
          <Toggle
            label="Allow videos"
            description="Guests can post short videos."
            name="allow_videos"
            form={form}
          />
          <Toggle
            label="Show EXIF"
            description="Reveal camera details on each photo."
            name="show_exif"
            form={form}
          />
        </Section>

        <div className="flex items-center justify-end">
          <Button type="submit" disabled={saveM.isPending}>
            {saveM.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save changes
          </Button>
        </div>

        <div className="rounded-3xl border border-destructive/40 bg-destructive/5 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div className="flex-1">
              <h3 className="font-display text-xl">Danger zone</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Archiving removes the event from your dashboard and closes the join and gallery
                flows.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Archive event
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive this event?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Guests will no longer be able to join or view the gallery. Photos remain in
                    storage.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => archiveM.mutate()}>Archive</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </form>
      <JoinCard slug={e.slug} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-3xl border border-border bg-card p-6">
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

type BoolKey =
  | "allow_uploads"
  | "allow_downloads"
  | "allow_comments"
  | "allow_likes"
  | "show_exif"
  | "allow_videos";
function Toggle({
  label,
  description,
  name,
  form,
}: {
  label: string;
  description: string;
  name: BoolKey;
  form: ReturnType<typeof useForm<FormValues>>;
}) {
  const v = form.watch(name);
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background/50 p-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch checked={v} onCheckedChange={(nv) => form.setValue(name, nv)} />
    </label>
  );
}
