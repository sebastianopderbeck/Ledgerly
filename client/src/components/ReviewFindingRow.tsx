import type { ReactNode } from "react";
import { Box, Checkbox, ListItem, ListItemButton, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { MIN_TAP_SIZE } from "./tapTarget.js";

export interface ReviewFindingRowProps {
  findingKey: string;
  title: string;
  amount: string;
  reviewed: boolean;
  onToggle: (key: string, reviewed: boolean) => void;
  children: ReactNode;
}

const REVIEWED_OPACITY = 0.6;

const rowSx: SxProps<Theme> = { minHeight: MIN_TAP_SIZE, alignItems: "flex-start", gap: 1.5, px: 1, py: 1.25 };

export const findingDetailsSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 0.75,
  mt: 0.5,
};

export const ReviewFindingRow = ({ findingKey, title, amount, reviewed, onToggle, children }: ReviewFindingRowProps) => {
  const handleClick = () => onToggle(findingKey, !reviewed);

  return (
    <ListItem disablePadding divider sx={{ opacity: reviewed ? REVIEWED_OPACITY : 1 }}>
      <ListItemButton onClick={handleClick} sx={rowSx}>
        <Checkbox
          edge="start"
          checked={reviewed}
          tabIndex={-1}
          disableRipple
          inputProps={{ "aria-label": `revisado: ${title}` }}
          sx={{ p: 0.5 }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{title}</Typography>
            <Typography sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{amount}</Typography>
          </Box>
          {children}
        </Box>
      </ListItemButton>
    </ListItem>
  );
};
