import { Fragment } from "react";
import { NavLink } from "react-router-dom";
import { Box, ButtonBase, Divider, Typography } from "@mui/material";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import { BottomSheet } from "../BottomSheet.js";
import { MORE_GROUPS } from "./navItems.js";
import { useNavSearch } from "./useNavSearch.js";

interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
}

const gridSx: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 1,
};

const itemSx: SxProps<Theme> = {
  display: "grid",
  justifyItems: "center",
  gap: 0.75,
  py: 1.5,
  borderRadius: "14px",
  color: "text.primary",
  bgcolor: "action.hover",
  "&.active": {
    color: "primary.main",
    bgcolor: (theme: Theme) => alpha(theme.palette.primary.main, 0.12),
  },
};

export const MoreSheet = ({ open, onClose }: MoreSheetProps) => {
  const search = useNavSearch();

  const groups = MORE_GROUPS.map(({ id, items }, index) => (
    <Fragment key={id}>
      {index > 0 && <Divider sx={{ my: 1.5 }} />}
      <Box sx={gridSx}>
        {items.map(({ to, label, icon: Icon }) => (
          <ButtonBase key={to} component={NavLink} to={{ pathname: to, search }} onClick={onClose} sx={itemSx}>
            <Icon />
            <Typography variant="caption" sx={{ fontWeight: 500 }}>{label}</Typography>
          </ButtonBase>
        ))}
      </Box>
    </Fragment>
  ));

  return (
    <BottomSheet open={open} onClose={onClose} title="Más secciones">
      <Box component="nav" aria-label="más secciones">
        {groups}
      </Box>
    </BottomSheet>
  );
};
