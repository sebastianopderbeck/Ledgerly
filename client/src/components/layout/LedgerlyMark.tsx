import { useId } from "react";
import { useTheme } from "@mui/material/styles";

interface LedgerlyMarkProps {
  size?: number;
}

interface MarkBar {
  id: string;
  x: number;
  y: number;
  height: number;
  opacity: number;
}

const BARS: MarkBar[] = [
  { id: "low", x: 22, y: 33, height: 13, opacity: 0.7 },
  { id: "mid", x: 34, y: 23, height: 23, opacity: 0.85 },
  { id: "high", x: 46, y: 12, height: 34, opacity: 1 },
];

export const LedgerlyMark = ({ size = 30 }: LedgerlyMarkProps) => {
  const theme = useTheme();
  const gradientId = `ledgerly-mark-${useId().replace(/:/g, "")}`;
  const paint = `url(#${gradientId})`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="14" y1="50" x2="50" y2="14">
          <stop offset="0" stopColor={theme.palette.primary.main} />
          <stop offset="1" stopColor={theme.palette.secondary.main} />
        </linearGradient>
      </defs>
      <path d="M12 9 V53 H54" fill="none" stroke={paint} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      {BARS.map((bar) => (
        <rect key={bar.id} x={bar.x} y={bar.y} width={8} height={bar.height} rx={4} fill={paint} opacity={bar.opacity} />
      ))}
    </svg>
  );
};
