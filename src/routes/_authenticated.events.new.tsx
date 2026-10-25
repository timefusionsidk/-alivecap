import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { createEvent } from "@/lib/admin/admin.functions";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(1000).optional(),
  venue: z.string().trim().max(200).optional(),
  event_date: z.string().optional(),
  password: z.string().max(200).optional(),
  allow_uploads: z.boolean(),
  allow_downloads: z.boolean(),
  allow_comments: z.boolean(),
  allow_likes: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/_authenticated/events/new")({
  head: () => ({
    meta: [
      { title: "New event — alivecap" },
      { name: "description", content: "Set up a new alivecap event." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewEvent,
});

function NewEvent() {
  const navigate = useNavigate();
  const create = useServerFn(createEvent);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      venue: "",
      event_date: "",
      password: "",
      allow_uploads: true,
      allow_downloads: true,
      allow_comments: true,
      allow_likes: true,
    },
  });

  const m = useMutation({
    mutationFn: (values: FormValues) =>
      create({
        data: {
          ...values,
          description: values.description || undefined,
          venue: values.venue || undefined,
          event_date: values.event_date || undefined,
          password: values.password ? values.password : undefined,
        },
      }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Event created");
        navigate({ to: "/events/$id", params: { id: res.event.id } });
      }
    },
    onError: (e: unknown) => toast.error(toUserMessage(e)),
  });

  return (
    <main className="editorial-page max-w-4xl">
      <header className="border-b border-border">
        <div className="flex w-full items-center gap-3 px-4 py-4">
          <Link
            to="/dashboard"
            className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">New event</p>
            <h1 className="font-display text-2xl">Set the scene</h1>
          </div>
        </div>
      </header>

      <section className="w-full px-4 py-10">
        <form
          onSubmit={form.handleSubmit((v) => m.mutate(v))}
          className="space-y-8 rounded-3xl border border-border bg-card p-8 shadow-elegant"
          noValidate
        >
          <div className="grid gap-6">
            <div>
              <Label htmlFor="name">Event name</Label>
              <Input
                id="name"
                placeholder="Sarah & Miguel's wedding"
                {...form.register("name")}
                className="mt-2"
              />
              {form.formState.errors.name && (
                <p className="mt-1 text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                rows={3}
                placeholder="A short note for your guests."
                {...form.register("description")}
                className="mt-2"
              />
            </div>
            <div className="grid gap-4">
              <div>
                <Label htmlFor="venue">Venue</Label>
                <Input
                  id="venue"
                  placeholder="Optional"
                  {...form.register("venue")}
                  className="mt-2"
                />
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
            <div>
              <Label htmlFor="password">Access password (optional)</Label>
              <Input
                id="password"
                type="text"
                placeholder="Leave blank for an open event"
                {...form.register("password")}
                className="mt-2"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Guests will enter this before they can shoot.
              </p>
            </div>
          </div>

          <div className="space-y-4 border-t border-border pt-6">
            <p className="text-sm font-medium">Guest permissions</p>
            <PermissionToggle
              label="Allow uploads"
              description="Guests can capture and post photos."
              name="allow_uploads"
              form={form}
            />
            <PermissionToggle
              label="Allow downloads"
              description="Guests can save photos from the gallery."
              name="allow_downloads"
              form={form}
            />
            <PermissionToggle
              label="Allow comments"
              description="Guests can leave notes on photos."
              name="allow_comments"
              form={form}
            />
            <PermissionToggle
              label="Allow likes"
              description="Guests can heart photos."
              name="allow_likes"
              form={form}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" asChild>
              <Link to="/dashboard">Cancel</Link>
            </Button>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-2 h-4 w-4" />
              )}
              Create event
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}

type PermKey = "allow_uploads" | "allow_downloads" | "allow_comments" | "allow_likes";
function PermissionToggle({
  label,
  description,
  name,
  form,
}: {
  label: string;
  description: string;
  name: PermKey;
  form: ReturnType<typeof useForm<FormValues>>;
}) {
  const value = form.watch(name);
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background/50 p-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch checked={value} onCheckedChange={(v) => form.setValue(name, v)} />
    </label>
  );
}
