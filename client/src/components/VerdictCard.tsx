import { Box, Card, CardContent, Chip, Typography } from "@mui/material";
import type { MacroVerdict, VerdictOption } from "../macroSignals.js";
import { formatPercent } from "../format.js";
import { MotionBox } from "./motion/motion.js";
import { fadeUpItem } from "./motion/variants.js";

const CERTEZA_LABEL: Record<VerdictOption["certeza"], string> = {
  alta: "retorno cierto",
  media: "depende de la inflación",
  baja: "depende de la reversión",
};

interface VerdictCardProps {
  verdict: MacroVerdict;
}

export const VerdictCard = ({ verdict }: VerdictCardProps) => (
  <MotionBox variants={fadeUpItem} initial="hidden" animate="visible">
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary" sx={{ display: "block" }}>
          Veredicto del mes
        </Typography>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>{verdict.resumen}</Typography>
        <Box sx={{ display: "grid", gap: 1 }}>
          {verdict.ranking.map((opcion, position) => (
            <Box key={opcion.opcion} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Typography variant="h6" color="text.secondary" sx={{ width: 24 }}>{position + 1}</Typography>
              <Typography sx={{ flexGrow: 1 }}>{opcion.label}</Typography>
              <Chip size="small" variant="outlined" label={CERTEZA_LABEL[opcion.certeza]} />
              <Typography sx={{ fontWeight: 700, minWidth: 88, textAlign: "right" }}>
                {formatPercent(opcion.retornoReal)}
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  </MotionBox>
);
