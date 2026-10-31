import { useCallback, useState } from "react";
import { readCaptchaConfig } from "./captcha-config";
import { isCaptchaReady } from "./captcha-client";

export function useAuthCaptcha() {
  const config = readCaptchaConfig();
  const [token, setToken] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const reset = useCallback(() => {
    setToken(null);
    setGeneration((n) => n + 1);
  }, []);
  return { config, token, setToken, generation, reset, ready: isCaptchaReady(config, token) };
}
