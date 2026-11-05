import { Box, IconButton } from "@mui/material";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import type { CardServiceDTO } from "@ledgerly/shared";
import { CARD_SERVICES_LABEL, type CardServiceListProps } from "../cardServices.js";
import { formatMoney } from "../format.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { iconTapTargetSx } from "./tapTarget.js";

interface CardServiceCardProps {
  item: CardServiceDTO;
  onRemove: (item: CardServiceDTO) => void;
}

const NO_DETAILS: RecordField[] = [];

const CardServiceCard = ({ item, onRemove }: CardServiceCardProps) => {
  const { nombre, cardLabel, ultimoCargo, ultimoMonto } = item;
  const remove = () => onRemove(item);
  const action = (
    <IconButton aria-label={`quitar ${nombre} de Servicios`} onClick={remove} sx={iconTapTargetSx}>
      <RemoveCircleOutlineIcon />
    </IconButton>
  );
  const highlights: RecordField[] = [
    { label: "Monto", value: formatMoney(ultimoMonto, "ARS") },
    { label: "Último cargo", value: ultimoCargo },
  ];

  return <RecordCard title={nombre} meta={cardLabel} action={action} highlights={highlights} details={NO_DETAILS} />;
};

export const CardServiceCards = ({ items, onRemove }: CardServiceListProps) => {
  const cards = items.map((item) => <CardServiceCard key={item.key} item={item} onRemove={onRemove} />);

  return (
    <Box component="section" aria-label={CARD_SERVICES_LABEL}>
      <Box sx={recordListSx}>{cards}</Box>
    </Box>
  );
};
