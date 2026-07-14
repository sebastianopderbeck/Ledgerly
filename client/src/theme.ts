import { createContext, useContext, useMemo, useState } from "react";
import { createTheme, type Theme } from "@mui/material/styles";

type Mode = "light" | "dark";
interface ColorModeContextValue { mode: Mode; toggle: () => void; theme: Theme; }

const ColorModeContext = createContext<ColorModeContextValue | null>(null);

export function useColorModeState(): ColorModeContextValue {
  const [mode, setMode] = useState<Mode>("light");
  const theme = useMemo(() => createTheme({ palette: { mode } }), [mode]);
  const toggle = () => setMode((m) => (m === "light" ? "dark" : "light"));
  return { mode, toggle, theme };
}

export const ColorModeProvider = ColorModeContext.Provider;

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error("useColorMode fuera de provider");
  return ctx;
}
