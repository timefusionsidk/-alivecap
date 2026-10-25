import { createFileRoute, redirect } from "@tanstack/react-router";

/** Convenience alias so /signup always lands on the host sign-up screen. */
export const Route = createFileRoute("/signup")({
  beforeLoad: () => {
    throw redirect({ to: "/auth/sign-up", replace: true });
  },
});
