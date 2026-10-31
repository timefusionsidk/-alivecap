export function guestWriteRateLimitMessage(
  error: { code?: string; message?: string } | null,
  action: "upload" | "comment",
): string | null {
  if (error?.code !== "P0001" || error.message !== `alivecap_${action}_rate_limited`) return null;
  return action === "upload"
    ? "You have uploaded several photos recently. Please wait a minute and try again."
    : "You have posted several comments recently. Please wait a minute and try again.";
}

export function boundedRetrySeconds(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(900, Math.ceil(value)))
    : 60;
}
