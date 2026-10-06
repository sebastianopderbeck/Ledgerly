import { Chip, IconButton, Table, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from "@mui/material";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { Link as RouterLink } from "react-router-dom";
import type { SubscriptionDTO } from "@ledgerly/shared";
import { formatMoney, formatMoneyOrDash } from "../format.js";
import {
  AMOUNT_LABEL,
  increaseDetail,
  increaseLabel,
  previousCurrencyLabel,
  subscriptionMeta,
  subscriptionTransactionsLink,
  type SubscriptionListProps,
  type SubscriptionVariant,
} from "../subscriptions.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

interface SubscriptionRowProps {
  item: SubscriptionDTO;
  variant: SubscriptionVariant;
  onHide: (key: string) => void;
}

const TABLE_LABEL: Record<SubscriptionVariant, string> = {
  activas: "Suscripciones activas",
  cortadas: "Suscripciones que dejaron de cobrarse",
};

const captionSx = { display: "block" };

const dash = <Typography component="span" color="text.disabled">—</Typography>;

const SubscriptionRow = ({
  item: {
    key, nombre, busqueda, categoria, cardLabel, moneda, montoActual, montoMensualArs,
    primerCobro, ultimoCobro, proximoCobro, aumento, monedaAnterior,
  },
  variant,
  onHide,
}: SubscriptionRowProps) => {
  const isActive = variant === "activas";
  const previousCurrency = monedaAnterior && (
    <Typography variant="caption" color="text.secondary" sx={captionSx}>{previousCurrencyLabel(monedaAnterior)}</Typography>
  );
  const nextCharge = isActive && (
    <Typography variant="caption" color="text.secondary" sx={captionSx}>{`próximo ~${proximoCobro}`}</Typography>
  );
  const variation = aumento
    ? <Chip size="small" color="warning" label={increaseLabel(aumento)} title={increaseDetail(aumento, montoActual, moneda)} />
    : dash;
  const variationCell = isActive && <TableCell>{variation}</TableCell>;

  return (
    <MotionTableRow variants={fadeUpItem}>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{nombre}</Typography>
        <Typography variant="caption" color="text.secondary" sx={captionSx}>{subscriptionMeta({ cardLabel, categoria })}</Typography>
        {previousCurrency}
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{formatMoney(montoActual, moneda)}</TableCell>
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{formatMoneyOrDash(montoMensualArs, "ARS")}</TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>{primerCobro}</TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        {ultimoCobro}
        {nextCharge}
      </TableCell>
      {variationCell}
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
        <Tooltip title="Ocultar: no es una suscripción" describeChild>
          <IconButton aria-label={`Ocultar ${nombre}`} onClick={() => onHide(key)}>
            <VisibilityOffOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton component={RouterLink} to={subscriptionTransactionsLink(busqueda)} aria-label={`Ver movimientos de ${nombre}`}>
          <ReceiptLongOutlinedIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </MotionTableRow>
  );
};

export const SubscriptionsTable = ({ items, variant, onHide }: SubscriptionListProps) => {
  const variationHeader = variant === "activas" && <TableCell>Variación</TableCell>;
  const rows = items.map((item) => <SubscriptionRow key={item.key} item={item} variant={variant} onHide={onHide} />);

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label={TABLE_LABEL[variant]}>
        <TableHead>
          <TableRow>
            <TableCell>Comercio</TableCell>
            <TableCell align="right">{AMOUNT_LABEL[variant]}</TableCell>
            <TableCell align="right">En pesos</TableCell>
            <TableCell>Desde</TableCell>
            <TableCell>Último cobro</TableCell>
            {variationHeader}
            <TableCell align="right" aria-label="Acciones" />
          </TableRow>
        </TableHead>
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {rows}
        </MotionTableBody>
      </Table>
    </TableContainer>
  );
};
