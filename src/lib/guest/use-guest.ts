import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEVICE_KEY = "alivecap.device_id";

/**
 * Stable per-browser identifier used to de-duplicate guest records: a refresh or a
 * double-tap on "Join" reuses the same guest row instead of creating a new one.
 */
export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/**
 * Guests have no account: they get an anonymous Supabase session, which is what
 * authorises every guest read/write through RLS. No privileged key involved.
 */
export async function ensureGuestSession(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error) return null;
  return anon.session?.user?.id ?? null;
}

/** Ends the guest's anonymous session (used by "Leave event"). */
export async function clearGuestSession(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  // Never sign a real host account out of the guest screens.
  if (data.user && data.user.is_anonymous === false) return;
  try {
    await supabase.auth.signOut();
  } catch {
    // Ignore: the session is discarded locally either way.
  }
}

/** SSR-safe hook: reports whether a session exists yet (guest or host). */
export function useGuestSession(): { token: string | null; hydrated: boolean } {
  const [state, setState] = useState<{ token: string | null; hydrated: boolean }>({
    token: null,
    hydrated: false,
  });
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState({ token: data.session?.user?.id ?? null, hydrated: true });
    });
    return () => {
      active = false;
    };
  }, []);
  return state;
}
