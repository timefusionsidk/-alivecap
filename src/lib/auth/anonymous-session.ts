// Minimal public Auth interface keeps token forwarding independently testable.
type GuestAuth = {
  getSession: () => Promise<{
    data: { session: { user: { id: string } } | null };
    error: { message: string } | null;
  }>;
  signInAnonymously: (options?: { options?: { captchaToken?: string } }) => Promise<{
    data: { session: { user: { id: string } } | null };
    error: { message: string; code?: string } | null;
  }>;
};

export async function ensureAnonymousSession(
  auth: GuestAuth,
  captchaToken?: string | null,
  captchaRequired = false,
): Promise<string> {
  const { data, error } = await auth.getSession();
  // Reuse both guest and real host sessions; never replace a host identity.
  if (data.session?.user) return data.session.user.id;
  if (error) throw new Error("Could not restore your session. Refresh and try again.");
  if (captchaRequired && !captchaToken)
    throw new Error("Complete the verification before joining.");
  const { data: anon, error: signInError } = await auth.signInAnonymously(
    captchaToken ? { options: { captchaToken } } : undefined,
  );
  if (signInError?.code === "captcha_failed") {
    throw new Error("Verification expired or was rejected. Please complete it again.");
  }
  if (
    signInError?.code === "over_request_rate_limit" ||
    signInError?.code === "over_anonymous_users_rate_limit"
  ) {
    throw new Error("Too many guest sessions. Please wait a minute and try again.");
  }
  if (signInError || !anon.session?.user) {
    throw new Error("Could not start a guest session. Please try again shortly.");
  }
  return anon.session.user.id;
}
