import { useCallback, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Box, ButtonBase, Typography } from "@mui/material";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { BAR_ITEMS, isMoreRoute } from "./navItems.js";
import { MoreSheet } from "./MoreSheet.js";
import { useNavSearch } from "./useNavSearch.js";

export const MOBILE_NAV_HEIGHT = 64;

const barSx: SxProps<Theme> = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: (theme) => theme.zIndex.appBar,
  display: "grid",
  gridTemplateColumns: `repeat(${BAR_ITEMS.length + 1}, minmax(0, 1fr))`,
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
  px: 0.5,
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
  const [moreOpen, setMoreOpen] = useState(false);
  const openMore = useCallback(() => setMoreOpen(true), []);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const moreActive = isMoreRoute(pathname);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const links = BAR_ITEMS.map(({ to, label, shortLabel, icon: Icon }) => (
    <ButtonBase key={to} component={NavLink} to={{ pathname: to, search }} end={to === "/"} sx={itemSx}>
      <Icon />
      <Typography noWrap>{shortLabel ?? label}</Typography>
    </ButtonBase>
  ));

  return (
    <>
      <Box component="nav" aria-label="principal" sx={barSx}>
        {links}
        <ButtonBase
          onClick={openMore}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-current={moreActive ? "page" : undefined}
          sx={itemSx}
        >
          <MoreHorizIcon />
          <Typography noWrap>Más</Typography>
        </ButtonBase>
      </Box>
      <MoreSheet open={moreOpen} onClose={closeMore} />
    </>
  );
};
