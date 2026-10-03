import { useMediaQuery, useTheme } from "@mui/material";

export function useIsMobile(): boolean {
  const theme = useTheme();
  return !useMediaQuery(theme.breakpoints.up("md"), { noSsr: true, defaultMatches: true });
}
