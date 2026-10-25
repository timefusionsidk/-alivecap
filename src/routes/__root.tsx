import { Brand } from "@/components/brand";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { MotionConfig } from "framer-motion";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "sonner";
import { AuthProvider } from "../lib/auth/auth-context";
import { missingSupabaseEnvNames } from "../lib/supabase-config";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mb-8">
          <Brand />
        </div>
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error instanceof Error ? error : new Error(String(error)), { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mb-8">
          <Brand />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "alivecap — Live event camera & shared gallery" },
      {
        name: "description",
        content:
          "Every guest, every angle, every moment — in one live gallery. QR-code in, custom camera with filters, no accounts, no downloads until it's over.",
      },
      { name: "author", content: "alivecap" },
      { property: "og:title", content: "alivecap — Live event camera & shared gallery" },
      {
        property: "og:description",
        content:
          "Every guest, every angle, every moment — in one live gallery. QR-code in, custom camera with filters, no accounts, no downloads until it's over.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#0f0e0c" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "alivecap" },
      { name: "twitter:title", content: "alivecap — Live event camera & shared gallery" },
      {
        name: "twitter:description",
        content:
          "Every guest, every angle, every moment — in one live gallery. QR-code in, custom camera with filters, no accounts, no downloads until it's over.",
      },
      // Social preview images belong on shareable leaf routes (e.g. /join/$slug),
      // never on the root — a root og:image overrides every child route's image.
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/brand/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function ConfigErrorComponent({ missing }: { missing: string[] }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          alivecap isn&apos;t configured yet
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The app is missing its backend configuration and can&apos;t start.
        </p>
        <ul className="mt-4 space-y-1 text-left text-sm text-muted-foreground">
          {missing.map((name) => (
            <li key={name} className="rounded-md bg-muted px-3 py-2 font-mono text-xs">
              {name}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Set these environment variables in your hosting project, then redeploy.
        </p>
      </div>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const missing = missingSupabaseEnvNames();

  if (missing.length > 0) {
    return (
      <div className="app-backdrop min-h-dvh w-full">
        <div className="relative mx-auto flex min-h-dvh w-full max-w-none flex-col bg-background">
          <ConfigErrorComponent missing={missing} />
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MotionConfig reducedMotion="user">
          {/* Responsive application; each route owns its content width. */}
          <div className="app-backdrop min-h-dvh w-full">
            <div className="relative mx-auto flex min-h-dvh w-full max-w-none flex-col overflow-x-hidden bg-background sm:shadow-elegant">
              {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
              <Outlet />
            </div>
          </div>
          <Toaster position="top-center" richColors closeButton />
        </MotionConfig>
      </AuthProvider>
    </QueryClientProvider>
  );
}
