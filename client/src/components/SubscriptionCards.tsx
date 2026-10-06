import { Box, Chip, IconButton, Link } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { Link as RouterLink } from "react-router-dom";
import type { SubscriptionDTO } from "@ledgerly/shared";
import { formatMoney, formatMoneyOrDash } from "../format.js";
import {
  AMOUNT_LABEL,
  increaseShortLabel,
  increaseSinceDetail,
  previousCurrencyLabel,
  subscriptionMeta,
  subscriptionTransactionsLink,
  type SubscriptionListProps,
  type SubscriptionVariant,
} from "../subscriptions.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { MIN_TAP_SIZE, iconTapTargetSx } from "./tapTarget.js";

interface SubscriptionCardProps {
  item: SubscriptionDTO;
  variant: SubscriptionVariant;
  onHide: (key: string) => void;
}

const movementsLinkSx: SxProps<Theme> = { display: "inline-flex", alignItems: "center", minHeight: MIN_TAP_SIZE };

const highlightsOf = ({ montoActual, moneda, montoMensualArs }: SubscriptionDTO, variant: SubscriptionVariant): RecordField[] => [
  { label: AMOUNT_LABEL[variant], value: formatMoney(montoActual, moneda) },
  { label: "En pesos", value: formatMoneyOrDash(montoMensualArs, "ARS") },
];

const detailsOf = (item: SubscriptionDTO, variant: SubscriptionVariant): RecordField[] => {
  const { nombre, busqueda, primerCobro, ultimoCobro, proximoCobro, cobros, aumento, montoActual, moneda, monedaAnterior } = item;
  const nextCharge: RecordField[] = variant === "activas" ? [{ label: "Próximo cobro", value: proximoCobro }] : [];
  const increase: RecordField[] = aumento
    ? [{ label: "Aumento", value: increaseSinceDetail(aumento, montoActual, moneda) }]
    : [];
  const currency: RecordField[] = monedaAnterior ? [{ label: "Moneda", value: previousCurrencyLabel(monedaAnterior) }] : [];
  const movements = (
    <Link
      component={RouterLink}
      to={subscriptionTransactionsLink(busqueda)}
      aria-label={`Ver movimientos de ${nombre}`}
      sx={movementsLinkSx}
    >
      Ver movimientos
    </Link>
  );
  return [
    { label: "Desde", value: primerCobro },
    { label: "Último cobro", value: ultimoCobro },
    ...nextCharge,
    { label: "Cobros", value: String(cobros) },
    ...increase,
    ...currency,
    { label: "Movimientos", value: movements },
  ];
};

const SubscriptionCard = ({ item, variant, onHide }: SubscriptionCardProps) => {
  const badge = item.aumento ? <Chip size="small" color="warning" label={increaseShortLabel(item.aumento)} /> : undefined;
  const action = (
    <IconButton aria-label={`Ocultar ${item.nombre}`} onClick={() => onHide(item.key)} sx={iconTapTargetSx}>
      <VisibilityOffOutlinedIcon />
    </IconButton>
  );

  return (
    <RecordCard
      title={item.nombre}
      meta={subscriptionMeta(item)}
      badge={badge}
      action={action}
      highlights={highlightsOf(item, variant)}
      details={detailsOf(item, variant)}
    />
  );
};

export const SubscriptionCards = ({ items, variant, onHide }: SubscriptionListProps) => {
  const cards = items.map((item) => <SubscriptionCard key={item.key} item={item} variant={variant} onHide={onHide} />);
  return <Box sx={recordListSx}>{cards}</Box>;
};
