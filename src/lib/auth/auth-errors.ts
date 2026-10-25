import type { AuthError } from "@supabase/supabase-js";

/**
 * Maps Supabase / network errors to safe, user-friendly copy.
 * Raw Supabase messages are never surfaced to the UI.
 */
export function mapAuthError(error: unknown): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline. Check your connection and try again.";
  }

  if (!error) return "Something went wrong. Please try again.";

  const err = error as Partial<AuthError> & { message?: string; status?: number; name?: string; code?: string };
  const code = err.code ?? "";
  const message = (err.message ?? "").toLowerCase();
  const status = err.status;

  if (err.name === "AbortError" || message.includes("timeout") || message.includes("timed out")) {
    return "The request timed out. Please try again.";
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "We couldn't reach the server. Check your connection and try again.";
  }

  const byCode: Record<string, string> = {
    invalid_credentials: "That email and password combination doesn't match an account.",
    email_not_confirmed: "Please verify your email address first — check your inbox for the link.",
    user_already_exists: "An account with that email already exists. Try signing in instead.",
    email_exists: "An account with that email already exists. Try signing in instead.",
    weak_password: "That password is too weak. Use at least 8 characters with a mix of letters and numbers.",
    over_request_rate_limit: "Too many attempts. Please wait a minute and try again.",
    over_email_send_rate_limit: "Too many attempts. Please wait a minute and try again.",
    same_password: "Your new password must be different from your current one.",
    session_not_found: "Your session expired. Please sign in again.",
    refresh_token_not_found: "Your session expired. Please sign in again.",
    refresh_token_already_used: "Your session expired. Please sign in again.",
    otp_expired: "That link is invalid or has expired. Please request a new one.",
  };
  if (code && byCode[code]) return byCode[code];

  if (message.includes("invalid login credentials")) {
    return "That email and password combination doesn't match an account.";
  }
  if (message.includes("email not confirmed")) {
    return "Please verify your email address first — check your inbox for the link.";
  }
  if (message.includes("already registered") || message.includes("already been registered") || message.includes("user already")) {
    return "An account with that email already exists. Try signing in instead.";
  }
  if (message.includes("password should be") || message.includes("weak password")) {
    return "That password is too weak. Use at least 8 characters with a mix of letters and numbers.";
  }
  if (message.includes("rate limit") || status === 429) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (message.includes("expired") || message.includes("invalid token") || message.includes("token has expired")) {
    return "That link is invalid or has expired. Please request a new one.";
  }
  if (status && status >= 500) {
    return "Our authentication service is temporarily unavailable. Please try again shortly.";
  }

  return "Something went wrong. Please try again.";
}

/** Guards a promise so a hung network call cannot leave the UI spinning forever. */
export async function withTimeout<T>(promise: Promise<T>, ms = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error("Request timed out");
      e.name = "AbortError";
      reject(e);
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
