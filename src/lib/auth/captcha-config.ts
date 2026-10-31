export type CaptchaConfig =
  | { enabled: false; provider?: never; siteKey?: never; error?: never }
  | { enabled: true; provider: "turnstile" | "hcaptcha"; siteKey: string; error?: never }
  | { enabled: true; provider?: never; siteKey?: never; error: string };

export function parseCaptchaConfig(provider?: string, siteKey?: string): CaptchaConfig {
  const name = provider?.trim();
  const key = siteKey?.trim();
  if (!name && !key) return { enabled: false };
  if ((name !== "turnstile" && name !== "hcaptcha") || !key) {
    return { enabled: true, error: "Verification is unavailable. Please contact the event host." };
  }
  return { enabled: true, provider: name, siteKey: key };
}

export function readCaptchaConfig(): CaptchaConfig {
  return parseCaptchaConfig(
    import.meta.env.VITE_AUTH_CAPTCHA_PROVIDER,
    import.meta.env.VITE_AUTH_CAPTCHA_SITE_KEY,
  );
}
