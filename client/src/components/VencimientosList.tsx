import { useId } from "react";
import { Box, Card, Chip, List, ListItem, Typography } from "@mui/material";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import { formatDayOfMonthLong } from "../isoDate.js";
import {
  diaDelMes, etiquetaDia, montoTexto, montoUsdTexto, resumenDeGrupo, type GrupoVencimientos, type Vencimiento,
} from "../vencimientos.js";
import { MotionBox } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";
import { MIN_TAP_SIZE } from "./tapTarget.js";

interface VencimientosListProps { grupos: GrupoVencimientos[]; hoy: string; }
interface GrupoCardProps { grupo: GrupoVencimientos; hoy: string; }
interface VencimientoRowProps { item: Vencimiento; hoy: string; }
interface FichaFechaProps { fecha: string; hoy: string; confirmado: boolean; }
interface EstadoChipProps { confirmado: boolean; }

const listSx: SxProps<Theme> = { display: "grid", gap: 2, maxWidth: 840 };

const headerSx: SxProps<Theme> = { px: 2, pt: 1.5, pb: 1, borderBottom: 1, borderColor: "divider" };

const rowSx: SxProps<Theme> = {
  gap: 1.5, px: 2, py: 1.25, alignItems: "flex-start", "&:last-of-type": { borderBottom: 0 },
};

const fichaSx = (confirmado: boolean): SxProps<Theme> => ({
  minWidth: MIN_TAP_SIZE,
  minHeight: MIN_TAP_SIZE,
  px: 0.5,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 1.5,
  border: "1px dashed",
  borderColor: confirmado ? "transparent" : "divider",
  bgcolor: (theme: Theme) => (confirmado ? alpha(theme.palette.primary.main, 0.12) : "transparent"),
  color: confirmado ? "primary.main" : "text.secondary",
});

const montoColor = ({ sentido, monto }: Vencimiento): string => {
  if (sentido === "cobro") return "success.main";
  return monto === null ? "text.secondary" : "text.primary";
};

const FichaFecha = ({ fecha, hoy, confirmado }: FichaFechaProps) => (
  <Box sx={fichaSx(confirmado)}>
    <Typography component="span" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{diaDelMes(fecha)}</Typography>
    <Typography component="span" variant="caption" sx={{ lineHeight: 1.1 }}>{etiquetaDia(fecha, hoy)}</Typography>
  </Box>
);

const EstadoChip = ({ confirmado }: EstadoChipProps) => {
  if (confirmado) return <Chip size="small" variant="outlined" color="success" label="Confirmado" />;
  return <Chip size="small" variant="outlined" label="Estimado" sx={{ borderStyle: "dashed" }} />;
};

const VencimientoRow = ({ item, hoy }: VencimientoRowProps) => {
  const confirmado = item.estado === "confirmado";
  const aConfirmar = item.monto === null;
  const usd = montoUsdTexto(item);
  const label = `${item.titulo}, ${formatDayOfMonthLong(item.fecha)}, ${item.estado}`;
  const montoVariant = aConfirmar ? "caption" : "body1";
  const montoSx: SxProps<Theme> = { fontWeight: aConfirmar ? 400 : 600, whiteSpace: "nowrap" };

  return (
    <ListItem divider aria-label={label} sx={rowSx}>
      <FichaFecha fecha={item.fecha} hoy={hoy} confirmado={confirmado} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{item.titulo}</Typography>
          <Typography variant={montoVariant} color={montoColor(item)} sx={montoSx}>{montoTexto(item)}</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 0.75, rowGap: 0.5, mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">{item.detalle}</Typography>
          <EstadoChip confirmado={confirmado} />
          {usd && <Typography variant="caption" color="text.secondary">{usd}</Typography>}
        </Box>
      </Box>
    </ListItem>
  );
};

const GrupoCard = ({ grupo, hoy }: GrupoCardProps) => {
  const tituloId = useId();
  const resumen = resumenDeGrupo(grupo);
  const filas = grupo.items.map((item) => <VencimientoRow key={item.id} item={item} hoy={hoy} />);

  return (
    <MotionBox variants={fadeUpItem}>
      <Card component="section" aria-labelledby={tituloId}>
        <Box sx={headerSx}>
          <Typography id={tituloId} component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>{grupo.titulo}</Typography>
          <Typography component="p" variant="caption" color="text.secondary">{resumen}</Typography>
        </Box>
        <List disablePadding>{filas}</List>
      </Card>
    </MotionBox>
  );
};

export const VencimientosList = ({ grupos, hoy }: VencimientosListProps) => {
  const tarjetas = grupos.map((grupo) => <GrupoCard key={grupo.clave} grupo={grupo} hoy={hoy} />);
  return (
    <MotionBox variants={staggerContainer} initial="hidden" animate="visible" sx={listSx}>
      {tarjetas}
    </MotionBox>
  );
};
