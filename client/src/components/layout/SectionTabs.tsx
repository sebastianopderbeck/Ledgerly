import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Box, ButtonBase } from "@mui/material";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import type { NavSection } from "./navItems.js";
import { scrollToReveal } from "./scrollToReveal.js";
import { useNavSearch } from "./useNavSearch.js";

interface SectionTabsProps {
  section: NavSection;
}

const stripSx: SxProps<Theme> = {
  position: "relative",
  display: "inline-flex",
  maxWidth: "100%",
  gap: 0.5,
  p: 0.5,
  overflowX: "auto",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
  borderRadius: 999,
  bgcolor: "background.paper",
  border: 1,
  borderColor: "divider",
};

const tabSx: SxProps<Theme> = {
  flexShrink: 0,
  gap: 1,
  px: 1.75,
  py: 0.875,
  borderRadius: 999,
  color: "text.secondary",
  fontSize: 14,
  fontWeight: 500,
  whiteSpace: "nowrap",
  transition: "background-color 160ms ease, color 160ms ease",
  "&:hover": { color: "text.primary", bgcolor: "action.hover" },
  "&.Mui-focusVisible": { outline: 2, outlineColor: "primary.main", outlineStyle: "solid" },
  "&.active": {
    color: "primary.main",
    fontWeight: 600,
    bgcolor: (theme: Theme) => alpha(theme.palette.primary.main, 0.12),
  },
};

export const SectionTabs = ({ section }: SectionTabsProps) => {
  const search = useNavSearch();
  const { pathname } = useLocation();
  const stripRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    const tab = activeTabRef.current;
    if (!strip || !tab) return;
    strip.scrollLeft = scrollToReveal(
      { scrollLeft: strip.scrollLeft, width: strip.clientWidth },
      { left: tab.offsetLeft, width: tab.offsetWidth },
    );
  }, [pathname]);

  const tabs = section.tabs.map(({ to, label, icon: Icon }) => (
    <ButtonBase
      key={to}
      ref={to === pathname ? activeTabRef : undefined}
      component={NavLink}
      to={{ pathname: to, search }}
      end={to === "/"}
      sx={tabSx}
    >
      <Icon fontSize="small" />
      {label}
    </ButtonBase>
  ));

  return (
    <Box component="nav" aria-label={`secciones de ${section.label}`} sx={{ mb: 3, display: "flex" }}>
      <Box ref={stripRef} sx={stripSx}>{tabs}</Box>
    </Box>
  );
};
