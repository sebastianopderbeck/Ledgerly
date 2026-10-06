import type { MouseEvent } from "react";
import { Box, Chip, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useIsMobile } from "../useIsMobile.js";
import { MIN_TAP_SIZE } from "./tapTarget.js";
import type { ReviewPickerOption } from "./useStatementReviewPicker.js";

export interface StatementReviewPickerProps {
  options: ReviewPickerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface PendingBadgeProps {
  pending: number | null;
}

const optionSx: SxProps<Theme> = {
  minHeight: MIN_TAP_SIZE,
  gap: 1.5,
  justifyContent: "space-between",
  textAlign: "left",
  textTransform: "none",
  px: 2,
};

const PendingBadge = ({ pending }: PendingBadgeProps) => {
  if (pending === null) return null;
  if (pending === 0) return <CheckCircleOutlineIcon color="success" fontSize="small" titleAccess="revisado" />;
  return <Chip size="small" color="warning" label={pending} />;
};

export const StatementReviewPicker = ({ options, selectedId, onSelect }: StatementReviewPickerProps) => {
  const isMobile = useIsMobile();
  if (options.length < 2) return null;

  const orientation = isMobile ? "vertical" : "horizontal";
  const handleChange = (_event: MouseEvent<HTMLElement>, value: string | null) => {
    if (value !== null) onSelect(value);
  };
  const buttons = options.map((option) => (
    <ToggleButton key={option.id} value={option.id} sx={optionSx}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{option.label}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {option.caption}
        </Typography>
      </Box>
      <PendingBadge pending={option.pending} />
    </ToggleButton>
  ));

  return (
    <ToggleButtonGroup
      exclusive
      value={selectedId}
      onChange={handleChange}
      orientation={orientation}
      fullWidth={isMobile}
      aria-label="resumen a revisar"
      sx={{ mb: 2 }}
    >
      {buttons}
    </ToggleButtonGroup>
  );
};
