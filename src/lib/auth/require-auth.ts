import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Auth middleware for every host-facing server function: validates the request
 * bearer token and exposes an RLS-scoped `supabase` client plus `userId`.
 */
export const requireAuth = requireSupabaseAuth;