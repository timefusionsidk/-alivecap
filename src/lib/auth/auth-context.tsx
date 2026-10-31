import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { mapAuthError, withTimeout } from "./auth-errors";

export type AuthResult =
  | { ok: true; needsEmailVerification?: boolean }
  | { ok: false; error: string };

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    fullName?: string,
    captchaToken?: string,
  ) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string, captchaToken?: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  refreshSession: () => Promise<Session | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Absolute, deployment-agnostic URL for auth email redirects (never hardcodes localhost). */
function siteUrl(path = ""): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    // 1. Subscribe FIRST so no event fires between restore and subscribe.
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);

      const nextUserId = nextSession?.user?.id ?? null;
      const identityChanged = nextUserId !== lastUserId.current;
      lastUserId.current = nextUserId;

      // TOKEN_REFRESHED / INITIAL_SESSION must not thrash the router or cache.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        if (!identityChanged && event === "SIGNED_IN") return;
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });

    // 2. Restore any persisted session (survives refresh, tab close, restart).
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        lastUserId.current = data.session?.user?.id ?? null;
        setSession(data.session);
      })
      .catch((e) => console.error("[auth] getSession failed", e))
      .finally(() => {
        if (active) setLoading(false);
      });

    // 3. Cross-tab sync: another tab signing in/out writes to localStorage.
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.key.startsWith("sb-")) return;
      supabase.auth.getSession().then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        lastUserId.current = data.session?.user?.id ?? null;
        router.invalidate();
      });
    };
    window.addEventListener("storage", onStorage);

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, [router, queryClient]);

  const signIn = useCallback<AuthContextValue["signIn"]>(async (email, password, captchaToken) => {
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
          options: { captchaToken },
        }),
      );
      if (error) return { ok: false, error: mapAuthError(error) };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: mapAuthError(e) };
    }
  }, []);

  const signUp = useCallback<AuthContextValue["signUp"]>(
    async (email, password, fullName, captchaToken) => {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              captchaToken,
              emailRedirectTo: siteUrl("/auth/callback"),
              data: fullName ? { full_name: fullName } : undefined,
            },
          }),
        );
        if (error) return { ok: false, error: mapAuthError(error) };
        // Supabase returns an identities array of length 0 for an existing account.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          return {
            ok: false,
            error: "An account with that email already exists. Try signing in instead.",
          };
        }
        return { ok: true, needsEmailVerification: !data.session };
      } catch (e) {
        return { ok: false, error: mapAuthError(e) };
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    // Order matters: stop in-flight protected queries before the session is cleared.
    await queryClient.cancelQueries();
    queryClient.clear();
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("[auth] signOut failed", e);
    }
    setSession(null);
    lastUserId.current = null;
  }, [queryClient]);

  const resetPassword = useCallback<AuthContextValue["resetPassword"]>(
    async (email, captchaToken) => {
      try {
        const { error } = await withTimeout(
          supabase.auth.resetPasswordForEmail(email.trim(), {
            captchaToken,
            redirectTo: siteUrl("/auth/reset-password"),
          }),
        );
        if (error) return { ok: false, error: mapAuthError(error) };
        return { ok: true };
      } catch (e) {
        return { ok: false, error: mapAuthError(e) };
      }
    },
    [],
  );

  const updatePassword = useCallback<AuthContextValue["updatePassword"]>(async (password) => {
    try {
      const { error } = await withTimeout(supabase.auth.updateUser({ password }));
      if (error) return { ok: false, error: mapAuthError(error) };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: mapAuthError(e) };
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const { data, error } = await withTimeout(supabase.auth.refreshSession());
      if (error) {
        console.error("[auth] refreshSession failed", error);
        return null;
      }
      setSession(data.session);
      return data.session;
    } catch (e) {
      console.error("[auth] refreshSession failed", e);
      return null;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      isAuthenticated: !!session?.user,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      refreshSession,
    }),
    [session, loading, signIn, signUp, signOut, resetPassword, updatePassword, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
