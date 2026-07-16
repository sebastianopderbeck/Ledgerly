import type { ReactNode } from "react";
import { Card, CardContent, Typography } from "@mui/material";
import { MotionBox } from "../motion/motion.js";
import { fadeUpItem } from "../motion/variants.js";

interface ChartCardProps {
  title: string;
  children: ReactNode;
}

export const ChartCard = ({ title, children }: ChartCardProps) => (
  <MotionBox variants={fadeUpItem}>
    <Card><CardContent>
      <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
      {children}
    </CardContent></Card>
  </MotionBox>
);
