import type { CaptchaConfig } from "./captcha-config";

type Provider = "turnstile" | "hcaptcha";
export type CaptchaApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      theme: "auto" | "light";
      size: "compact";
    },
  ) => string | number;
  remove: (widget: string | number) => void;
};

declare global {
  interface Window {
    turnstile?: CaptchaApi;
    hcaptcha?: CaptchaApi;
    alivecapTurnstileReady?: () => void;
    alivecapHcaptchaReady?: () => void;
  }
}

const pending = new Map<Provider, Promise<CaptchaApi>>();

// Fixed official URLs: provider/sitekey settings cannot inject arbitrary scripts.
export function loadCaptcha(provider: Provider): Promise<CaptchaApi> {
  if (window[provider]) return Promise.resolve(window[provider]!);
  const current = pending.get(provider);
  if (current) return current;
  const callback = provider === "turnstile" ? "alivecapTurnstileReady" : "alivecapHcaptchaReady";
  const src =
    provider === "turnstile"
      ? "https://challenges.cloudflare.com/turnstile/v0/api.js"
      : "https://js.hcaptcha.com/1/api.js";
  const promise = new Promise<CaptchaApi>((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const done = (api?: CaptchaApi) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      delete window[callback];
      if (api) resolve(api);
      else {
        script.remove();
        reject(new Error("Verification could not load. Check your connection and retry."));
      }
    };
    const timer = setTimeout(() => done(), 15000);
    window[callback] = () => done(window[provider]);
    script.src = `${src}?render=explicit&onload=${callback}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => done();
    document.head.appendChild(script);
  });
  pending.set(provider, promise);
  void promise.catch(() => pending.delete(provider));
  return promise;
}

export function isCaptchaReady(config: CaptchaConfig, token: string | null): boolean {
  return !config.enabled || (!config.error && Boolean(token));
}
