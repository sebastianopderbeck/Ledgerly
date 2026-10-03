import type { SxProps, Theme } from "@mui/material/styles";

export const MIN_TAP_SIZE = 44;

export const tapTargetSx: SxProps<Theme> = { minHeight: MIN_TAP_SIZE };

export const iconTapTargetSx: SxProps<Theme> = { minWidth: MIN_TAP_SIZE, minHeight: MIN_TAP_SIZE };
