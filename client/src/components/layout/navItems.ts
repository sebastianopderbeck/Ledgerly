import type { SvgIconComponent } from "@mui/icons-material";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import ElectricalServicesOutlinedIcon from "@mui/icons-material/ElectricalServicesOutlined";
import ShoppingBagOutlinedIcon from "@mui/icons-material/ShoppingBagOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";

export interface NavTab {
  to: string;
  label: string;
  icon: SvgIconComponent;
}

export interface NavSection {
  id: string;
  label: string;
  icon: SvgIconComponent;
  tabs: NavTab[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "inicio",
    label: "Inicio",
    icon: SpaceDashboardOutlinedIcon,
    tabs: [{ to: "/", label: "Dashboard", icon: SpaceDashboardOutlinedIcon }],
  },
  {
    id: "gastos",
    label: "Gastos",
    icon: ShoppingBagOutlinedIcon,
    tabs: [
      { to: "/transactions", label: "Movimientos", icon: ReceiptLongOutlinedIcon },
      { to: "/suscripciones", label: "Suscripciones", icon: AutorenewOutlinedIcon },
      { to: "/servicios", label: "Servicios", icon: ElectricalServicesOutlinedIcon },
      { to: "/vencimientos", label: "Vencimientos", icon: EventNoteOutlinedIcon },
    ],
  },
  {
    id: "ingresos",
    label: "Ingresos",
    icon: PaymentsOutlinedIcon,
    tabs: [
      { to: "/sueldo", label: "Sueldo", icon: PaymentsOutlinedIcon },
      { to: "/flujo", label: "Flujo", icon: SavingsOutlinedIcon },
    ],
  },
  {
    id: "deudas",
    label: "Deudas",
    icon: AccountBalanceOutlinedIcon,
    tabs: [
      { to: "/credits", label: "Créditos", icon: AccountBalanceOutlinedIcon },
      { to: "/auto", label: "Auto", icon: DirectionsCarOutlinedIcon },
    ],
  },
  {
    id: "patrimonio",
    label: "Patrimonio",
    icon: AccountBalanceWalletOutlinedIcon,
    tabs: [
      { to: "/patrimonio", label: "Patrimonio", icon: AccountBalanceWalletOutlinedIcon },
      { to: "/contexto", label: "Contexto", icon: InsightsOutlinedIcon },
    ],
  },
];

export const FOOTER_SECTIONS: NavSection[] = [
  {
    id: "datos",
    label: "Datos",
    icon: StorageOutlinedIcon,
    tabs: [
      { to: "/import", label: "Importar", icon: UploadFileOutlinedIcon },
      { to: "/rules", label: "Reglas", icon: RuleOutlinedIcon },
    ],
  },
];

const ALL_SECTIONS: NavSection[] = [...NAV_SECTIONS, ...FOOTER_SECTIONS];

export const sectionOf = (pathname: string): NavSection | undefined =>
  ALL_SECTIONS.find(({ tabs }) => tabs.some(({ to }) => to === pathname));

export const sectionPath = (section: NavSection): string => section.tabs[0].to;

export const hasTabs = (section: NavSection): boolean => section.tabs.length > 1;

export const sectionTitle = (section: NavSection): string => (hasTabs(section) ? section.label : section.tabs[0].label);

export const RAIL = { width: 84, gap: 12 } as const;
