export type FilterPreset = {
  id: string;
  label: string;
  /** CSS filter string, applied to <video> preview and canvas capture. */
  css: string;
};

export const FILTER_PRESETS: FilterPreset[] = [
  { id: "none", label: "Original", css: "none" },
  { id: "chrome", label: "Chrome", css: "contrast(1.1) saturate(1.15) brightness(1.03)" },
  { id: "fade", label: "Fade", css: "contrast(0.9) saturate(0.85) brightness(1.08)" },
  { id: "mono", label: "Mono", css: "grayscale(1) contrast(1.05)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.35) brightness(0.92)" },
  { id: "silvertone", label: "Silver", css: "grayscale(1) contrast(1.1) sepia(0.15)" },
  { id: "sepia", label: "Sepia", css: "sepia(0.8) contrast(1.05) brightness(1.02)" },
  { id: "vivid", label: "Vivid", css: "saturate(1.5) contrast(1.1)" },
  { id: "warm", label: "Warm", css: "sepia(0.25) saturate(1.25) hue-rotate(-8deg)" },
  { id: "cool", label: "Cool", css: "saturate(1.1) hue-rotate(12deg) brightness(1.03)" },
  { id: "dramatic", label: "Dramatic", css: "contrast(1.35) saturate(1.05) brightness(0.94)" },
  { id: "honey", label: "Honey", css: "sepia(0.35) saturate(1.4) hue-rotate(-12deg) brightness(1.05)" },
  { id: "instant", label: "Instant", css: "sepia(0.15) contrast(1.15) saturate(1.2) brightness(1.05)" },
  { id: "moment", label: "Moment", css: "sepia(0.2) contrast(1.05) saturate(1.1) hue-rotate(-4deg)" },
  { id: "transfer", label: "Transfer", css: "sepia(0.3) contrast(1.2) saturate(1.3) hue-rotate(-15deg)" },
  { id: "process", label: "Process", css: "contrast(1.2) saturate(1.35) hue-rotate(20deg)" },
  { id: "sunset", label: "Sunset", css: "sepia(0.4) saturate(1.4) hue-rotate(-20deg) brightness(1.06)" },
  { id: "matte", label: "Matte", css: "contrast(0.92) saturate(0.9) brightness(1.06) sepia(0.08)" },
  { id: "film", label: "Film", css: "contrast(1.12) saturate(1.08) sepia(0.1) brightness(0.98)" },
  { id: "polar", label: "Polar", css: "contrast(1.05) saturate(0.7) brightness(1.1) hue-rotate(5deg)" },
];

export function getFilterCss(id: string): string {
  return FILTER_PRESETS.find((f) => f.id === id)?.css ?? "none";
}