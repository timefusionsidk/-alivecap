export function publicJoinUrl(slug: string): string {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  const origin = configured || (typeof window !== "undefined" ? window.location.origin : "");
  if (!origin) return "";
  const url = new URL(origin);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Invalid public application URL");
  return `${url.origin}/join/${encodeURIComponent(slug)}`;
}
