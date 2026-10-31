import { useEffect, useRef, useState } from "react";
import { loadCaptcha, type CaptchaApi } from "@/lib/auth/captcha-client";
import type { CaptchaConfig } from "@/lib/auth/captcha-config";
import { Button } from "@/components/ui/button";

export function CaptchaChallenge({
  config,
  onToken,
}: {
  config: CaptchaConfig;
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const provider = config.provider;
  const siteKey = config.siteKey;

  useEffect(() => {
    if (!provider || !siteKey) return;
    let active = true;
    let api: CaptchaApi | undefined;
    let widget: string | number | undefined;
    onToken(null);
    setError(null);
    loadCaptcha(provider)
      .then((loaded) => {
        if (!active || !container.current) return;
        api = loaded;
        widget = loaded.render(container.current, {
          sitekey: siteKey,
          size: "compact",
          theme: provider === "turnstile" ? "auto" : "light",
          callback: (token) => {
            if (active) {
              setError(null);
              onToken(token);
            }
          },
          "expired-callback": () => {
            if (active) onToken(null);
          },
          "error-callback": () => {
            if (active) {
              onToken(null);
              setError("Verification failed. Please retry.");
            }
          },
        });
      })
      .catch(() => {
        if (active) setError("Verification could not load. Check your connection and retry.");
      });
    return () => {
      active = false;
      if (widget !== undefined && api) api.remove(widget);
    };
  }, [provider, siteKey, onToken, attempt]);

  if (!config.enabled) return null;
  if (config.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {config.error}
      </p>
    );
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Complete the verification to continue.</p>
      <div ref={container} role="group" aria-label="Human verification" />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={() => setAttempt((n) => n + 1)}>
        Retry verification
      </Button>
    </div>
  );
}
