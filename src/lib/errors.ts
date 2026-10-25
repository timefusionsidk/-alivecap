/**
 * Turns any thrown value (server-fn error, PostgrestError, network failure)
 * into a short sentence a guest or host can act on. Raw driver text, SQL codes
 * and stack traces never reach the UI.
 */
export function toUserMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw = extractText(error);
  if (!raw) return fallback;

  const text = raw.toLowerCase();

  if (text.includes("unauthorized") || text.includes("jwt") || text.includes("401")) {
    return "Your session expired. Please sign in again.";
  }
  if (text.includes("failed to fetch") || text.includes("networkerror") || text.includes("load failed")) {
    return "You appear to be offline. Check your connection and try again.";
  }
  if (text.includes("timed out") || text.includes("timeout")) {
    return "That took too long. Please try again.";
  }
  if (text.includes("event not found")) {
    return "We couldn't find that event. It may have been archived.";
  }
  if (text.includes("no photos to export")) {
    return "There are no photos to bundle yet.";
  }
  if (text.includes("row-level security") || text.includes("permission denied") || text.includes("403")) {
    return "You don't have access to that.";
  }
  if (text.includes("duplicate key") || text.includes("23505")) {
    return "That already exists. Try a different value.";
  }
  if (text.includes("violates foreign key") || text.includes("23503")) {
    return "Unable to save your changes. Please refresh and try again.";
  }
  if (text.includes("payload too large") || text.includes("413")) {
    return "That file is too large to upload.";
  }
  if (text.includes("storage") && text.includes("not found")) {
    return "That file is no longer available.";
  }

  // Short, human-authored messages from our own server functions are safe to show.
  const looksTechnical =
    /error:|postgrest|pgrst|\bat \w+ \(|sql|\bcode\b|\{|\}/i.test(raw) || raw.length > 140;
  return looksTechnical ? fallback : raw;
}

function extractText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message ?? "";
  if (typeof error === "object") {
    const o = error as { message?: unknown; error?: unknown; statusText?: unknown };
    if (typeof o.message === "string") return o.message;
    if (typeof o.error === "string") return o.error;
    if (typeof o.statusText === "string") return o.statusText;
  }
  return "";
}
