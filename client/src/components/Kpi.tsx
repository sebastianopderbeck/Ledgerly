import type { ReactNode } from "react";
import { Card, CardContent, Box, Typography } from "@mui/material";
import { MotionBox } from "./motion/motion.js";
import { CountUp } from "./motion/CountUp.js";
import { fadeUpItem } from "./motion/variants.js";
import { useIsMobile } from "../useIsMobile.js";
import { compactCardContentSx } from "./compactCardContentSx.js";

export type KpiColor = "primary" | "secondary" | "success" | "warning" | "error";

interface KpiProps {
  label: string;
  value: number;
  format: (value: number) => string;
  sub?: string;
  icon: ReactNode;
  color: KpiColor;
  subMultiline?: boolean;
}

const ICON_SIZE = { xs: 36, md: 46 };

export const Kpi = ({ label, value, format, sub, icon, color, subMultiline = false }: KpiProps) => {
  const isMobile = useIsMobile();
  const valueVariant = isMobile ? "h6" : "h5";

  return (
    <MotionBox variants={fadeUpItem}>
      <Card>
        <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, ...compactCardContentSx }}>
          <Box
            sx={{
              width: ICON_SIZE,
              height: ICON_SIZE,
              flexShrink: 0,
              borderRadius: 2.5,
              display: "grid",
              placeItems: "center",
              color: `${color}.main`,
              bgcolor: (theme) => `${theme.palette[color].main}1f`,
            }}
          >
            {icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
              {label}
            </Typography>
            <Typography variant={valueVariant} sx={{ fontWeight: 700 }} noWrap>
              <CountUp value={value} format={format} />
            </Typography>
            {sub && (
              <Typography variant="caption" color="text.secondary" noWrap={!subMultiline} sx={{ display: "block" }}>
                {sub}
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>
    </MotionBox>
  );
};
