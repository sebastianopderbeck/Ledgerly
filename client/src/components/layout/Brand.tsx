import { Box, Typography } from "@mui/material";
import { LedgerlyMark } from "./LedgerlyMark.js";

interface BrandProps {
  compact?: boolean;
}

export const Brand = ({ compact = false }: BrandProps) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: compact ? "center" : "flex-start",
      gap: 1.25,
      height: 72,
      px: compact ? 0 : 2.5,
      flexShrink: 0,
    }}
  >
    <LedgerlyMark />
    {!compact && (
      <Typography
        variant="h6"
        sx={{
          fontWeight: 700,
          letterSpacing: "-0.02em",
          background: (theme) => `linear-gradient(90deg, ${theme.palette.primary.light}, ${theme.palette.secondary.main})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        Ledgerly
      </Typography>
    )}
  </Box>
);
