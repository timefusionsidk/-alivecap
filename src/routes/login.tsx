import { createFileRoute, redirect } from "@tanstack/react-router";

/** Convenience alias so /login always lands on the host sign-in screen. */
export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    throw redirect({ to: "/auth/login", search: { redirect: undefined }, replace: true });
  },
});
