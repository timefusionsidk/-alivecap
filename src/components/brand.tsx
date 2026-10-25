import { cn } from "@/lib/utils";

/** Supplied artwork; CSS frames the wordmark's printed bounds without distortion. */
export function Brand({
  variant = "wordmark",
  className,
}: {
  variant?: "icon" | "wordmark";
  className?: string;
}) {
  return variant === "icon" ? (
    <img
      src="/brand/app-icon.png"
      width="1280"
      height="1280"
      alt="alivecap"
      className={cn("brand-icon", className)}
    />
  ) : (
    <span className={cn("brand-wordmark", className)}>
      <img src="/brand/wordmark.png" width="1920" height="960" alt="alivecap" />
    </span>
  );
}
