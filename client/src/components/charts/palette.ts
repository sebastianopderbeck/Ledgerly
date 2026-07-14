export const CATEGORICAL_LIGHT = [
  "#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834",
];
export const CATEGORICAL_DARK = [
  "#3987e5", "#199e70", "#c98500", "#34a853", "#9085e9", "#e66767", "#d55181", "#d95926",
];

type Mode = "light" | "dark";

export function categoricalPalette(mode: Mode): string[] {
  return mode === "dark" ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
}

export function seriesColor(mode: Mode, slot: number): string {
  const palette = categoricalPalette(mode);
  return palette[slot % palette.length];
}
