import { createFileRoute, redirect } from "@tanstack/react-router";

/** Shareable short alias: /camera/<event code> → the guest event camera. */
export const Route = createFileRoute("/camera/$code")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/e/$slug/camera", params: { slug: params.code }, replace: true });
  },
});
