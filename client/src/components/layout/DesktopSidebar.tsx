import { useLocation } from "react-router-dom";
import { Box, Divider, Drawer } from "@mui/material";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import { LedgerlyMark } from "./LedgerlyMark.js";
import { FOOTER_SECTIONS, NAV_SECTIONS, RAIL, sectionOf, type NavSection } from "./navItems.js";
import { RailLink } from "./RailLink.js";

const drawerSx: SxProps<Theme> = {
  width: RAIL.width + RAIL.gap,
  flexShrink: 0,
  "& .MuiDrawer-paper": {
    top: RAIL.gap,
    left: RAIL.gap,
    width: RAIL.width,
    height: "auto",
    maxHeight: `calc(100vh - ${RAIL.gap * 2}px)`,
    overflowX: "hidden",
    overflowY: "auto",
    boxSizing: "border-box",
    borderRadius: "28px",
    border: 1,
    borderColor: "divider",
    bgcolor: (theme: Theme) => alpha(theme.palette.background.paper, 0.55),
    backdropFilter: "blur(14px) saturate(140%)",
    WebkitBackdropFilter: "blur(14px) saturate(140%)",
    boxShadow: (theme: Theme) => `0 12px 32px -16px ${alpha(theme.palette.common.black, 0.55)}`,
  },
};

const brandSx: SxProps<Theme> = { height: 60, display: "grid", placeItems: "center", flexShrink: 0 };

const navSx: SxProps<Theme> = { display: "flex", flexDirection: "column", gap: 0.75, px: 1, pb: 1.5 };

export const DesktopSidebar = () => {
  const activeId = sectionOf(useLocation().pathname)?.id;

  const linkOf = (section: NavSection) => (
    <RailLink key={section.id} section={section} active={section.id === activeId} />
  );

  return (
    <Drawer variant="permanent" sx={drawerSx}>
      <Box sx={brandSx}><LedgerlyMark /></Box>
      <Box component="nav" aria-label="principal" sx={navSx}>
        {NAV_SECTIONS.map(linkOf)}
        <Divider sx={{ my: 0.5, mx: 1 }} />
        {FOOTER_SECTIONS.map(linkOf)}
      </Box>
    </Drawer>
  );
};
