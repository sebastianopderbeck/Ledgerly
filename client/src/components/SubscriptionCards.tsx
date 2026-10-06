import { Box, Chip, IconButton, Link } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { Link as RouterLink } from "react-router-dom";
import type { Cadencia, SubscriptionDTO } from "@ledgerly/shared";
import { formatMoney, formatMoneyOrDash } from "../format.js";
import {
  AMOUNT_LABEL,
  cadenceAmountCaption,
  increaseShortLabel,
  increaseSinceDetail,
  previousCurrencyLabel,
  subscriptionMeta,
  subscriptionTransactionsLink,
  type SubscriptionListProps,
  type SubscriptionVariant,
} from "../subscriptions.js";
import { CadenceMenu } from "./CadenceMenu.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { MIN_TAP_SIZE, iconTapTargetSx } from "./tapTarget.js";

interface SubscriptionCardProps {
  item: SubscriptionDTO;
  variant: SubscriptionVariant;
  onHide: (key: string) => void;
  onChangeCadence: (key: string, cadencia: Cadencia) => void;
}

const movementsLinkSx: SxProps<Theme> = { display: "inline-flex", alignItems: "center", minHeight: MIN_TAP_SIZE };

const actionsSx: SxProps<Theme> = { display: "flex" };

const amountOf = ({ montoActual, moneda, cadencia }: SubscriptionDTO): string => {
  const amount = formatMoney(montoActual, moneda);
  const caption = cadenceAmountCaption(cadencia);
  return caption === null ? amount : `${amount} ${caption}`;
};

const highlightsOf = (item: SubscriptionDTO, variant: SubscriptionVariant): RecordField[] => [
  { label: AMOUNT_LABEL[variant], value: amountOf(item) },
  { label: "En pesos", value: formatMoneyOrDash(item.montoMensualArs, "ARS") },
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

const SubscriptionCard = ({ item, variant, onHide, onChangeCadence }: SubscriptionCardProps) => {
  const badge = item.aumento ? <Chip size="small" color="warning" label={increaseShortLabel(item.aumento)} /> : undefined;
  const changeCadence = (next: Cadencia) => onChangeCadence(item.key, next);
  const hide = () => onHide(item.key);
  const action = (
    <Box sx={actionsSx}>
      <CadenceMenu nombre={item.nombre} cadencia={item.cadencia} onChange={changeCadence} buttonSx={iconTapTargetSx} />
      <IconButton aria-label={`Ocultar ${item.nombre}`} onClick={hide} sx={iconTapTargetSx}>
        <VisibilityOffOutlinedIcon />
      </IconButton>
    </Box>
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

export const SubscriptionCards = ({ items, variant, onHide, onChangeCadence }: SubscriptionListProps) => {
  const cards = items.map((item) => (
    <SubscriptionCard key={item.key} item={item} variant={variant} onHide={onHide} onChangeCadence={onChangeCadence} />
  ));
  return <Box sx={recordListSx}>{cards}</Box>;
};
