import { createContext, useContext, useMemo, useState } from "react";
import { createTheme, alpha, type Theme } from "@mui/material/styles";

type Mode = "light" | "dark";
interface ColorModeContextValue { mode: Mode; toggle: () => void; theme: Theme; }

interface ModeTokens {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryContrast: string;
  secondary: string;
  bgDefault: string;
  bgPaper: string;
  textPrimary: string;
  textSecondary: string;
  divider: string;
  success: string;
  error: string;
  warning: string;
  glow: string;
  cardGradient: string;
  cardShadow: string;
  cardHoverShadow: string;
  appBarBg: string;
  scrollThumb: string;
}

const DARK: ModeTokens = {
  primary: "#22d3ee",
  primaryDark: "#06b6d4",
  primaryLight: "#67e8f9",
  primaryContrast: "#04141a",
  secondary: "#818cf8",
  bgDefault: "#0b0f19",
  bgPaper: "#131a2a",
  textPrimary: "#e6edf3",
  textSecondary: "#8b97a8",
  divider: "rgba(255,255,255,0.08)",
  success: "#22c55e",
  error: "#f87171",
  warning: "#fbbf24",
  glow: "radial-gradient(1100px 560px at 50% -240px, rgba(34,211,238,0.14), transparent 62%)",
  cardGradient: "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0))",
  cardShadow: "0 1px 2px rgba(0,0,0,0.4)",
  cardHoverShadow: "0 16px 40px -18px rgba(0,0,0,0.75)",
  appBarBg: "rgba(11,15,25,0.72)",
  scrollThumb: "rgba(255,255,255,0.14)",
};

const LIGHT: ModeTokens = {
  primary: "#0891b2",
  primaryDark: "#0e7490",
  primaryLight: "#22d3ee",
  primaryContrast: "#ffffff",
  secondary: "#6366f1",
  bgDefault: "#f4f7fb",
  bgPaper: "#ffffff",
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  divider: "rgba(15,23,42,0.08)",
  success: "#16a34a",
  error: "#dc2626",
  warning: "#d97706",
  glow: "radial-gradient(1100px 560px at 50% -240px, rgba(8,145,178,0.10), transparent 62%)",
  cardGradient: "linear-gradient(180deg, rgba(255,255,255,0.6), rgba(255,255,255,0))",
  cardShadow: "0 1px 2px rgba(15,23,42,0.06)",
  cardHoverShadow: "0 16px 40px -20px rgba(15,23,42,0.28)",
  appBarBg: "rgba(244,247,251,0.78)",
  scrollThumb: "rgba(15,23,42,0.18)",
};

function buildTheme(mode: Mode): Theme {
  const t = mode === "dark" ? DARK : LIGHT;
  return createTheme({
    palette: {
      mode,
      primary: { main: t.primary, dark: t.primaryDark, light: t.primaryLight, contrastText: t.primaryContrast },
      secondary: { main: t.secondary },
      background: { default: t.bgDefault, paper: t.bgPaper },
      text: { primary: t.textPrimary, secondary: t.textSecondary },
      divider: t.divider,
      success: { main: t.success },
      error: { main: t.error },
      warning: { main: t.warning },
      info: { main: t.primary },
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: '"Poppins", "Segoe UI", system-ui, -apple-system, sans-serif',
      h4: { fontWeight: 700, letterSpacing: "-0.02em" },
      h5: { fontWeight: 700, letterSpacing: "-0.01em" },
      h6: { fontWeight: 600, letterSpacing: "-0.01em" },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
      button: { fontWeight: 600 },
      overline: { fontWeight: 600, letterSpacing: "0.14em" },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: t.bgDefault,
            backgroundImage: t.glow,
            backgroundRepeat: "no-repeat",
            backgroundAttachment: "fixed",
            minHeight: "100vh",
          },
          "*::-webkit-scrollbar": { width: 10, height: 10 },
          "*::-webkit-scrollbar-thumb": { backgroundColor: t.scrollThumb, borderRadius: 8 },
          "*::-webkit-scrollbar-track": { backgroundColor: "transparent" },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: "transparent" },
        styleOverrides: {
          root: {
            backgroundColor: t.appBarBg,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            backgroundImage: "none",
            borderBottom: `1px solid ${t.divider}`,
            color: t.textPrimary,
          },
        },
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: "none" } },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: t.cardGradient,
            border: `1px solid ${t.divider}`,
            borderRadius: 18,
            boxShadow: t.cardShadow,
            transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
            "&:hover": {
              transform: "translateY(-3px)",
              boxShadow: t.cardHoverShadow,
              borderColor: alpha(t.primary, 0.45),
            },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { textTransform: "none", borderRadius: 999, paddingInline: 18 },
          containedPrimary: {
            "&:hover": { backgroundColor: t.primaryDark, boxShadow: `0 8px 22px -10px ${alpha(t.primary, 0.9)}` },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { backgroundColor: t.bgPaper, color: t.textPrimary, border: `1px solid ${t.divider}`, fontSize: 12 },
        },
      },
    },
  });
}

const ColorModeContext = createContext<ColorModeContextValue | null>(null);

export function useColorModeState(): ColorModeContextValue {
  const [mode, setMode] = useState<Mode>("dark");
  const theme = useMemo(() => buildTheme(mode), [mode]);
  const toggle = () => setMode((m) => (m === "light" ? "dark" : "light"));
  return { mode, toggle, theme };
}

export const ColorModeProvider = ColorModeContext.Provider;

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error("useColorMode fuera de provider");
  return ctx;
}
