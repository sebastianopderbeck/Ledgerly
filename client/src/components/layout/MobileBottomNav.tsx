import { Link, useLocation } from "react-router-dom";
import { Box, ButtonBase, Typography } from "@mui/material";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import { NAV_SECTIONS, sectionOf, sectionPath } from "./navItems.js";
import { useNavSearch } from "./useNavSearch.js";

export const MOBILE_NAV_HEIGHT = 64;

const barSx: SxProps<Theme> = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: (theme) => theme.zIndex.appBar,
  display: "grid",
  gridTemplateColumns: `repeat(${NAV_SECTIONS.length}, minmax(0, 1fr))`,
  pb: "env(safe-area-inset-bottom)",
  borderTop: 1,
  borderColor: "divider",
  bgcolor: (theme) => alpha(theme.palette.background.default, 0.82),
  backdropFilter: "blur(14px) saturate(140%)",
  WebkitBackdropFilter: "blur(14px) saturate(140%)",
};

const itemSx: SxProps<Theme> = {
  height: MOBILE_NAV_HEIGHT,
  minWidth: 0,
  px: 0,
  display: "grid",
  alignContent: "center",
  justifyItems: "center",
  gap: 0.25,
  color: "text.secondary",
  "& .MuiTypography-root": { fontSize: 11, fontWeight: 500, maxWidth: "100%" },
  "&[aria-current='page']": {
    color: "primary.main",
    "& .MuiTypography-root": { fontWeight: 600 },
  },
};

export const MobileBottomNav = () => {
  const { pathname } = useLocation();
  const search = useNavSearch();
  const activeId = sectionOf(pathname)?.id;

  const links = NAV_SECTIONS.map((section) => {
    const { id, label, icon: Icon } = section;
    return (
      <ButtonBase
        key={id}
        component={Link}
        to={{ pathname: sectionPath(section), search }}
        aria-current={id === activeId ? "page" : undefined}
        sx={itemSx}
      >
        <Icon />
        <Typography noWrap>{label}</Typography>
      </ButtonBase>
    );
  });

  return (
    <Box component="nav" aria-label="principal" sx={barSx}>
      {links}
    </Box>
  );
};
