export const CATEGORICAL_LIGHT = [
  "#0891b2", "#6366f1", "#059669", "#d97706", "#db2777", "#ea580c", "#65a30d", "#dc2626",
  "#7c3aed", "#0d9488", "#c026d3", "#2563eb",
];
export const CATEGORICAL_DARK = [
  "#22d3ee", "#818cf8", "#34d399", "#fbbf24", "#f472b6", "#fb923c", "#a3e635", "#f87171",
  "#a78bfa", "#2dd4bf", "#e879f9", "#60a5fa",
];

type Mode = "light" | "dark";

export function categoricalPalette(mode: Mode): string[] {
  return mode === "dark" ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
}

export function seriesColor(mode: Mode, slot: number): string {
  const palette = categoricalPalette(mode);
  return palette[slot % palette.length];
}
