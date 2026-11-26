import { Box, Typography } from "@mui/material";
import { LedgerlyMark } from "./LedgerlyMark.js";

export const Brand = () => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: 1.25,
      height: 72,
      px: 2.5,
      flexShrink: 0,
    }}
  >
    <LedgerlyMark />
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
  </Box>
);
