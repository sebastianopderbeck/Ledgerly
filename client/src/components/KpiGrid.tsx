import type { ReactNode } from "react";
import { Box } from "@mui/material";
import { MotionBox } from "./motion/motion.js";
import { staggerContainer } from "./motion/variants.js";

type KpiCardCount = 3 | 4;

interface KpiGridProps {
  children: ReactNode;
  cardCount?: KpiCardCount;
}

const COLUMNS_BY_CONTAINER_WIDTH: Record<KpiCardCount, Record<string, { gridTemplateColumns: string }>> = {
  3: {
    "@container (min-width: 720px)": { gridTemplateColumns: "repeat(3, 1fr)" },
  },
  4: {
    "@container (min-width: 600px)": { gridTemplateColumns: "repeat(2, 1fr)" },
    "@container (min-width: 1100px)": { gridTemplateColumns: "repeat(4, 1fr)" },
  },
};

export const KpiGrid = ({ children, cardCount = 4 }: KpiGridProps) => (
  <Box sx={{ containerType: "inline-size", mb: 3 }}>
    <MotionBox
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      sx={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gap: 2,
        ...COLUMNS_BY_CONTAINER_WIDTH[cardCount],
      }}
    >
      {children}
    </MotionBox>
  </Box>
);
