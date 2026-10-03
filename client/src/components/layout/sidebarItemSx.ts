import { alpha, type SxProps, type Theme } from "@mui/material/styles";

export const sidebarItemSx = (collapsed: boolean): SxProps<Theme> => ({
  minHeight: 44,
  px: 1.5,
  gap: 1.5,
  borderRadius: "12px",
  justifyContent: collapsed ? "center" : "flex-start",
  color: "text.secondary",
  transition: "background-color 160ms ease, color 160ms ease",
  "& .MuiListItemIcon-root": { minWidth: 0, color: "inherit" },
  "& .MuiListItemText-root": { my: 0 },
  "& .MuiListItemText-primary": { fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" },
  "&:hover": { color: "text.primary", bgcolor: "action.hover" },
  "&.active": {
    color: "primary.main",
    bgcolor: (theme: Theme) => alpha(theme.palette.primary.main, 0.12),
    "& .MuiListItemText-primary": { fontWeight: 600 },
  },
});
