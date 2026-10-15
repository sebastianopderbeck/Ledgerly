import { IconButton, Table, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import type { FixedServiceDTO } from "@ledgerly/shared";
import { formatMoney, formatMonthLabel } from "../format.js";
import {
  CADENCIA_SERVICIO_LABEL, SERVICE_LIST_LABEL, SERVICE_MONTH_LABEL, monthlyEquivalent, serviceMonth,
  type FixedServiceListProps, type FixedServiceVariant,
} from "../fixedServices.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";
import { iconTapTargetSx } from "./tapTarget.js";

interface FixedServiceRowProps {
  item: FixedServiceDTO;
  variant: FixedServiceVariant;
  onEdit: (id: string) => void;
}

const NO_WRAP = { whiteSpace: "nowrap" } as const;

const CONTAINER_SX: Record<FixedServiceVariant, SxProps<Theme>> = {
  activos: { overflowX: "auto" },
  deBaja: { overflowX: "auto", opacity: 0.7 },
};

const money = (value: number): string => formatMoney(value, "ARS");

const FixedServiceRow = ({ item: { id, nombre, monto, cadencia, desde, hasta }, variant, onEdit }: FixedServiceRowProps) => {
  const mes = formatMonthLabel(serviceMonth(variant, { desde, hasta }));
  const porMes = money(monthlyEquivalent({ monto, cadencia }));
  const edit = () => onEdit(id);

  return (
    <MotionTableRow variants={fadeUpItem}>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{nombre}</Typography>
      </TableCell>
      <TableCell align="right" sx={NO_WRAP}>{money(monto)}</TableCell>
      <TableCell>{CADENCIA_SERVICIO_LABEL[cadencia]}</TableCell>
      <TableCell sx={NO_WRAP}>{mes}</TableCell>
      <TableCell align="right" sx={NO_WRAP}>{porMes}</TableCell>
      <TableCell align="right">
        <IconButton aria-label={`editar ${nombre}`} onClick={edit} sx={iconTapTargetSx}>
          <EditOutlinedIcon />
        </IconButton>
      </TableCell>
    </MotionTableRow>
  );
};

export const FixedServicesTable = ({ items, variant, onEdit }: FixedServiceListProps) => {
  const rows = items.map((item) => <FixedServiceRow key={item.id} item={item} variant={variant} onEdit={onEdit} />);

  return (
    <TableContainer sx={CONTAINER_SX[variant]}>
      <Table size="small" aria-label={SERVICE_LIST_LABEL[variant]}>
        <TableHead>
          <TableRow>
            <TableCell>Nombre</TableCell>
            <TableCell align="right">Monto</TableCell>
            <TableCell>Cadencia</TableCell>
            <TableCell>{SERVICE_MONTH_LABEL[variant]}</TableCell>
            <TableCell align="right">Por mes</TableCell>
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
