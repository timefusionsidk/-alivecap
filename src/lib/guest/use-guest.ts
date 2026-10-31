import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { ensureAnonymousSession } from "@/lib/auth/anonymous-session";
import { readCaptchaConfig } from "@/lib/auth/captcha-config";

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
export async function ensureGuestSession(captchaToken?: string | null): Promise<string> {
  const config = readCaptchaConfig();
  return ensureAnonymousSession(supabase.auth, captchaToken, config.enabled);
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
    let changed = false;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      changed = true;
      setState({ token: session?.user?.id ?? null, hydrated: true });
    });
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active || changed) return;
        setState({ token: data.session?.user?.id ?? null, hydrated: true });
      })
      .catch(() => {
        if (active && !changed) setState({ token: null, hydrated: true });
      });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  return state;
}
