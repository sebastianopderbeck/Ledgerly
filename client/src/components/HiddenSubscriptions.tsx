import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { SubscriptionDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { MotionBox } from "./motion/motion.js";
import { fadeUpItem } from "./motion/variants.js";
import { tapTargetSx } from "./tapTarget.js";

interface HiddenSubscriptionsProps {
  items: SubscriptionDTO[];
  onShow: (key: string) => void;
}

const rowSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 2,
  py: 1,
  "&:not(:first-of-type)": { borderTop: 1, borderColor: "divider" },
};

export const HiddenSubscriptions = ({ items, onShow }: HiddenSubscriptionsProps) => {
  const rows = items.map(({ key, nombre, montoActual, moneda }) => (
    <Box key={key} sx={rowSx}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{nombre}</Typography>
        <Typography variant="caption" color="text.secondary">{formatMoney(montoActual, moneda)}</Typography>
      </Box>
      <Button size="small" aria-label={`Mostrar ${nombre}`} onClick={() => onShow(key)} sx={tapTargetSx}>Mostrar</Button>
    </Box>
  ));

  return (
    <MotionBox variants={fadeUpItem} initial="hidden" animate="visible" sx={{ mt: 4 }}>
      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box>
            <Typography sx={{ fontWeight: 600 }}>{`Ocultas (${items.length})`}</Typography>
            <Typography variant="body2" color="text.secondary">No se suman a los totales.</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>{rows}</AccordionDetails>
      </Accordion>
    </MotionBox>
  );
};
