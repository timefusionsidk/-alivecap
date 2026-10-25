import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy alias — the canonical sign-in route is /auth/login. */
export const Route = createFileRoute("/auth/sign-in")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/auth/login", search, replace: true });
  },
});
