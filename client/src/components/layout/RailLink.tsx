import { Link } from "react-router-dom";
import { Box, ButtonBase, Typography } from "@mui/material";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import { sectionPath, type NavSection } from "./navItems.js";
import { useNavSearch } from "./useNavSearch.js";

interface RailLinkProps {
  section: NavSection;
  active: boolean;
}

const INDICATOR_CLASS = "rail-indicator";

const linkSx: SxProps<Theme> = {
  width: "100%",
  display: "grid",
  justifyItems: "center",
  gap: 0.5,
  py: 0.5,
  borderRadius: "14px",
  color: "text.secondary",
  transition: "color 160ms ease",
  [`& .${INDICATOR_CLASS}`]: {
    width: 52,
    height: 30,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    transition: "background-color 160ms ease",
  },
  "& .MuiTypography-root": { fontSize: 11, fontWeight: 500, maxWidth: "100%" },
  "&:hover": { color: "text.primary", [`& .${INDICATOR_CLASS}`]: { bgcolor: "action.hover" } },
  "&.Mui-focusVisible": { outline: 2, outlineColor: "primary.main", outlineStyle: "solid" },
  "&[aria-current='page']": {
    color: "primary.main",
    "& .MuiTypography-root": { fontWeight: 600 },
    [`& .${INDICATOR_CLASS}`]: { bgcolor: (theme: Theme) => alpha(theme.palette.primary.main, 0.12) },
  },
};

export const RailLink = ({ section, active }: RailLinkProps) => {
  const search = useNavSearch();
  const { label, icon: Icon } = section;

  return (
    <ButtonBase
      component={Link}
      to={{ pathname: sectionPath(section), search }}
      aria-current={active ? "page" : undefined}
      sx={linkSx}
    >
      <Box className={INDICATOR_CLASS}><Icon fontSize="small" /></Box>
      <Typography noWrap>{label}</Typography>
    </ButtonBase>
  );
};
