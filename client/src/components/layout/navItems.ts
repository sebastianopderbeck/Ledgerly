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

export interface NavItem {
  to: string;
  label: string;
  icon: SvgIconComponent;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: SpaceDashboardOutlinedIcon },
  { to: "/installments", label: "Cuotas", icon: CalendarMonthOutlinedIcon },
  { to: "/credits", label: "Créditos", icon: AccountBalanceOutlinedIcon },
  { to: "/auto", label: "Auto", icon: DirectionsCarOutlinedIcon },
  { to: "/sueldo", label: "Sueldo", icon: PaymentsOutlinedIcon },
  { to: "/contexto", label: "Contexto", icon: InsightsOutlinedIcon },
  { to: "/transactions", label: "Movimientos", icon: ReceiptLongOutlinedIcon },
  { to: "/rules", label: "Reglas", icon: RuleOutlinedIcon },
  { to: "/import", label: "Importar", icon: UploadFileOutlinedIcon },
];

export const SIDEBAR_WIDTH = { expanded: 240, collapsed: 72 } as const;
