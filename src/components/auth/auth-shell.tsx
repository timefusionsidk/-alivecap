import { Link } from "@tanstack/react-router";
import { Brand } from "@/components/brand";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="relative min-h-dvh bg-background">
      <div className="absolute inset-0 bg-hero" aria-hidden />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
        <Link to="/" className="flex items-center gap-2">
          <Brand />
        </Link>
        <div className="my-auto rounded-3xl border border-border bg-card p-8 shadow-elegant">
          <h1 className="font-display text-5xl tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
