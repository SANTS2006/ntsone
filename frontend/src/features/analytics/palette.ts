// Validated categorical palette (CVD-safe adjacent ordering) from the dataviz skill's
// reference instance, kept in fixed slot order -- never cycle or re-sort at call sites.
export const CATEGORICAL_LIGHT = [
  "#2a78d6", // 1 blue (matches brand primary)
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
];

export const CATEGORICAL_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

export const SEQUENTIAL_BLUE = "#2a78d6";

export function categoricalPalette(theme: "light" | "dark"): string[] {
  return theme === "dark" ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
}

// Registration-status semantic mapping, kept consistent with the app's StatusBadge colors.
export const STATUS_COLORS: Record<string, { light: string; dark: string }> = {
  submitted: { light: "#898781", dark: "#c3c2b7" },
  under_review: { light: "#fab219", dark: "#fab219" },
  approved: { light: "#0ca30c", dark: "#0ca30c" },
  rejected: { light: "#d03b3b", dark: "#e66767" },
  waitlisted: { light: "#eb6834", dark: "#d95926" },
  cancelled: { light: "#52514e", dark: "#898781" },
};
