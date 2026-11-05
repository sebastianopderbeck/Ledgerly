import { IconButton, Table, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import type { CardServiceDTO } from "@ledgerly/shared";
import { CARD_SERVICES_LABEL, type CardServiceListProps } from "../cardServices.js";
import { formatMoney } from "../format.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";
import { iconTapTargetSx } from "./tapTarget.js";

interface CardServiceRowProps {
  item: CardServiceDTO;
  onRemove: (item: CardServiceDTO) => void;
}

const NO_WRAP = { whiteSpace: "nowrap" } as const;

const CardServiceRow = ({ item, onRemove }: CardServiceRowProps) => {
  const { nombre, cardLabel, ultimoCargo, ultimoMonto } = item;
  const remove = () => onRemove(item);

  return (
    <MotionTableRow variants={fadeUpItem}>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{nombre}</Typography>
      </TableCell>
      <TableCell>{cardLabel}</TableCell>
      <TableCell sx={NO_WRAP}>{ultimoCargo}</TableCell>
      <TableCell align="right" sx={NO_WRAP}>{formatMoney(ultimoMonto, "ARS")}</TableCell>
      <TableCell align="right">
        <IconButton aria-label={`quitar ${nombre} de Servicios`} onClick={remove} sx={iconTapTargetSx}>
          <RemoveCircleOutlineIcon />
        </IconButton>
      </TableCell>
    </MotionTableRow>
  );
};

export const CardServicesTable = ({ items, onRemove }: CardServiceListProps) => {
  const rows = items.map((item) => <CardServiceRow key={item.key} item={item} onRemove={onRemove} />);

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label={CARD_SERVICES_LABEL}>
        <TableHead>
          <TableRow>
            <TableCell>Nombre</TableCell>
            <TableCell>Tarjeta</TableCell>
            <TableCell>Último cargo</TableCell>
            <TableCell align="right">Monto</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {rows}
        </MotionTableBody>
      </Table>
    </TableContainer>
  );
};
