import { Box, Card, CardContent, Divider, List, ListItem, ListItemButton, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import type { SxProps, Theme } from "@mui/material/styles";
import type { NetWorthItemDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { compactCardContentSx } from "./compactCardContentSx.js";
import { MotionBox } from "./motion/motion.js";
import { fadeUpItem } from "./motion/variants.js";

interface NetWorthItemsCardProps {
  title: string;
  items: NetWorthItemDTO[];
  totalArs: number;
  totalUsd: number;
  emptyText: string;
  onEdit: (assetId: string) => void;
}

interface ItemRowProps {
  item: NetWorthItemDTO;
  onEdit: (assetId: string) => void;
}

interface ItemContentProps {
  item: NetWorthItemDTO;
}

const rowSx: SxProps<Theme> = {
  display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 2, rowGap: 0.5, width: "100%",
};
const amountSx: SxProps<Theme> = { ml: "auto", textAlign: "right", minWidth: 0 };
const fixedRowSx: SxProps<Theme> = { minHeight: 56, px: 1 };
const editableRowSx: SxProps<Theme> = { minHeight: 56, px: 1, borderRadius: 2 };
const totalRowSx: SxProps<Theme> = { ...rowSx, px: 1 };
const captionBlockSx: SxProps<Theme> = { display: "block" };

const otherCurrency = ({ moneda, ars, usd }: NetWorthItemDTO): string =>
  (moneda === "ARS" ? `≈ ${formatMoney(usd, "USD")}` : `≈ ${formatMoney(ars, "ARS")}`);

const ItemContent = ({ item }: ItemContentProps) => (
  <Box sx={rowSx}>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontWeight: 600 }}>{item.label}</Typography>
      <Typography variant="caption" color="text.secondary" sx={captionBlockSx}>
        {item.detalle} · al {item.fecha}
      </Typography>
    </Box>
    <Box sx={amountSx}>
      <Typography noWrap sx={{ fontWeight: 600 }}>{formatMoney(item.montoOriginal, item.moneda)}</Typography>
      <Typography noWrap variant="caption" color="text.secondary" sx={captionBlockSx}>{otherCurrency(item)}</Typography>
    </Box>
  </Box>
);

const ItemRow = ({ item, onEdit }: ItemRowProps) => {
  const { assetId } = item;

  if (item.fuente !== "manual" || assetId === null) {
    return <ListItem disablePadding sx={fixedRowSx}><ItemContent item={item} /></ListItem>;
  }

  return (
    <ListItem disablePadding>
      <ListItemButton aria-label={`editar ${item.label}`} onClick={() => onEdit(assetId)} sx={editableRowSx}>
        <ItemContent item={item} />
        <ChevronRightIcon fontSize="small" color="action" sx={{ ml: 1 }} />
      </ListItemButton>
    </ListItem>
  );
};

export const NetWorthItemsCard = ({ title, items, totalArs, totalUsd, emptyText, onEdit }: NetWorthItemsCardProps) => {
  const rows = items.map((item) => <ItemRow key={item.id} item={item} onEdit={onEdit} />);
  const body = items.length > 0
    ? <List disablePadding>{rows}</List>
    : <Typography color="text.secondary" sx={{ px: 1, py: 1 }}>{emptyText}</Typography>;

  return (
    <MotionBox variants={fadeUpItem}>
      <Card component="section" aria-label={title} sx={{ height: "100%" }}>
        <CardContent sx={compactCardContentSx}>
          <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
          {body}
          <Divider sx={{ my: 1 }} />
          <Box sx={totalRowSx}>
            <Typography sx={{ fontWeight: 700 }}>Total</Typography>
            <Box sx={amountSx}>
              <Typography noWrap sx={{ fontWeight: 700 }}>{formatMoney(totalArs, "ARS")}</Typography>
              <Typography noWrap variant="caption" color="text.secondary" sx={captionBlockSx}>
                ≈ {formatMoney(totalUsd, "USD")}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </MotionBox>
  );
};
