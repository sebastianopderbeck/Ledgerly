import type { SxProps, Theme } from "@mui/material/styles";
import { MOBILE_NAV_HEIGHT } from "./layout/MobileBottomNav.js";

export const snackbarAboveNavSx: SxProps<Theme> = {
  bottom: { xs: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 8px)`, md: 24 },
};
