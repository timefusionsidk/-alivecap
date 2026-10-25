import { createFileRoute, redirect } from "@tanstack/react-router";

/** Shareable short alias: /gallery/<event code> → the live event gallery. */
export const Route = createFileRoute("/gallery/$code")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/e/$slug/gallery", params: { slug: params.code }, replace: true });
  },
});
