import type { SvgIconComponent } from "@mui/icons-material";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import TrackChangesOutlinedIcon from "@mui/icons-material/TrackChangesOutlined";
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import ElectricalServicesOutlinedIcon from "@mui/icons-material/ElectricalServicesOutlined";
import ShoppingBagOutlinedIcon from "@mui/icons-material/ShoppingBagOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";

export type NavPlacement = "bar" | "more";

export interface NavItem {
  to: string;
  label: string;
  icon: SvgIconComponent;
  placement: NavPlacement;
  shortLabel?: string;
}

export interface NavGroup {
  id: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "inicio",
    items: [
      { to: "/", label: "Dashboard", shortLabel: "Inicio", icon: SpaceDashboardOutlinedIcon, placement: "bar" },
      //{ to: "/installments", label: "Cuotas", icon: CalendarMonthOutlinedIcon, placement: "bar" },
    ],
  },
  {
    id: "dia-a-dia",
    items: [
      { to: "/sueldo", label: "Sueldo", icon: PaymentsOutlinedIcon, placement: "more" },
      { to: "/vencimientos", label: "Vencimientos", icon: EventNoteOutlinedIcon, placement: "more" },
      { to: "/flujo", label: "Flujo", icon: SavingsOutlinedIcon, placement: "more" },
      //{ to: "/presupuestos", label: "Presupuestos", icon: TrackChangesOutlinedIcon, placement: "more" },
      { to: "/suscripciones", label: "Suscripciones", icon: AutorenewOutlinedIcon, placement: "more" },
      { to: "/servicios", label: "Servicios", icon: ElectricalServicesOutlinedIcon, placement: "more" },
      { to: "/transactions", label: "Movimientos", icon: ReceiptLongOutlinedIcon, placement: "bar" },
    ],
  },
  {
    id: "largo-plazo",
    items: [
      { to: "/auto", label: "Auto", icon: DirectionsCarOutlinedIcon, placement: "more" },
      { to: "/credits", label: "Créditos", icon: AccountBalanceOutlinedIcon, placement: "more" },
      { to: "/patrimonio", label: "Patrimonio", icon: AccountBalanceWalletOutlinedIcon, placement: "more" },
      { to: "/contexto", label: "Contexto", icon: InsightsOutlinedIcon, placement: "more" },
    ],
  },
  {
    id: "ajustes",
    items: [
      { to: "/rules", label: "Reglas", icon: RuleOutlinedIcon, placement: "more" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap(({ items }) => items);

const isMoreItem = (item: NavItem): boolean => item.placement === "more";

export const BAR_ITEMS = NAV_ITEMS.filter((item) => item.placement === "bar");

export const MORE_GROUPS: NavGroup[] = NAV_GROUPS
  .map(({ id, items }) => ({ id, items: items.filter(isMoreItem) }))
  .filter(({ items }) => items.length > 0);

export const MORE_ITEMS = MORE_GROUPS.flatMap(({ items }) => items);

export const isMoreRoute = (pathname: string): boolean => MORE_ITEMS.some((item) => item.to === pathname);

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

export const SIDEBAR_WIDTH = { expanded: 240, collapsed: 72 } as const;
