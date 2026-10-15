import { Box, IconButton } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import type { FixedServiceDTO } from "@ledgerly/shared";
import { formatMoney, formatMonthLabel } from "../format.js";
import {
  CADENCIA_SERVICIO_LABEL, SERVICE_LIST_LABEL, SERVICE_MONTH_LABEL, monthlyEquivalent, serviceMonth,
  type FixedServiceListProps, type FixedServiceVariant,
} from "../fixedServices.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { iconTapTargetSx } from "./tapTarget.js";

interface FixedServiceCardProps {
  item: FixedServiceDTO;
  variant: FixedServiceVariant;
  onEdit: (id: string) => void;
}

const SECTION_SX: Record<FixedServiceVariant, SxProps<Theme>> = {
  activos: {},
  deBaja: { opacity: 0.7 },
};

const money = (value: number): string => formatMoney(value, "ARS");

const FixedServiceCard = ({ item: { id, nombre, monto, cadencia, desde, hasta }, variant, onEdit }: FixedServiceCardProps) => {
  const edit = () => onEdit(id);
  const action = (
    <IconButton aria-label={`editar ${nombre}`} onClick={edit} sx={iconTapTargetSx}>
      <EditOutlinedIcon />
    </IconButton>
  );
  const highlights: RecordField[] = [
    { label: "Por mes", value: money(monthlyEquivalent({ monto, cadencia })) },
    { label: "Monto", value: money(monto) },
  ];
  const details: RecordField[] = [
    { label: "Cadencia", value: CADENCIA_SERVICIO_LABEL[cadencia] },
    { label: SERVICE_MONTH_LABEL[variant], value: formatMonthLabel(serviceMonth(variant, { desde, hasta })) },
  ];

  return <RecordCard title={nombre} action={action} highlights={highlights} details={details} />;
};

export const FixedServiceCards = ({ items, variant, onEdit }: FixedServiceListProps) => {
  const cards = items.map((item) => <FixedServiceCard key={item.id} item={item} variant={variant} onEdit={onEdit} />);

  return (
    <Box component="section" aria-label={SERVICE_LIST_LABEL[variant]} sx={SECTION_SX[variant]}>
      <Box sx={recordListSx}>{cards}</Box>
    </Box>
  );
};
