import type { SvgIconComponent } from "@mui/icons-material";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";

export type NavPlacement = "bar" | "more";

export interface NavItem {
  to: string;
  label: string;
  icon: SvgIconComponent;
  placement: NavPlacement;
  shortLabel?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", shortLabel: "Inicio", icon: SpaceDashboardOutlinedIcon, placement: "bar" },
  { to: "/installments", label: "Cuotas", icon: CalendarMonthOutlinedIcon, placement: "bar" },
  { to: "/credits", label: "Créditos", icon: AccountBalanceOutlinedIcon, placement: "more" },
  { to: "/auto", label: "Auto", icon: DirectionsCarOutlinedIcon, placement: "more" },
  { to: "/sueldo", label: "Sueldo", icon: PaymentsOutlinedIcon, placement: "more" },
  { to: "/contexto", label: "Contexto", icon: InsightsOutlinedIcon, placement: "more" },
  { to: "/transactions", label: "Movimientos", icon: ReceiptLongOutlinedIcon, placement: "bar" },
  { to: "/rules", label: "Reglas", icon: RuleOutlinedIcon, placement: "more" },
  { to: "/import", label: "Importar", icon: UploadFileOutlinedIcon, placement: "bar" },
];

export const BAR_ITEMS = NAV_ITEMS.filter((item) => item.placement === "bar");

export const MORE_ITEMS = NAV_ITEMS.filter((item) => item.placement === "more");

export const isMoreRoute = (pathname: string): boolean => MORE_ITEMS.some((item) => item.to === pathname);

export const SIDEBAR_WIDTH = { expanded: 240, collapsed: 72 } as const;
