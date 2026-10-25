/**
 * Client-safe check that the *public* Supabase configuration is present.
 *
 * Only the two public variables are ever read here:
 *   - VITE_SUPABASE_URL
 *   - VITE_SUPABASE_PUBLISHABLE_KEY
 *
 * Values are never returned, logged, or rendered — only their presence.
 * Privileged credentials (service role / secret keys) are server-only and must
 * never be referenced from this module or any other browser-reachable file.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
}

/** Names (never values) of the missing public variables, for a clear setup message. */
export function missingSupabaseEnvNames(): string[] {
  return [
    ...(import.meta.env.VITE_SUPABASE_URL ? [] : ["VITE_SUPABASE_URL"]),
    ...(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ? [] : ["VITE_SUPABASE_PUBLISHABLE_KEY"]),
  ];
}
