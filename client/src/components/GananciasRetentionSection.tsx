import { useId } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Chip, Stack, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import { formatMoney } from "../format.js";
import {
  ajusteAnioAnteriorTexto,
  avisoRetencionTexto,
  mesDeCobroLabel,
  veredictoRetencionColor,
  veredictoRetencionLabel,
  type ResultadoRetencion,
} from "../gananciasRetencion.js";
import { useIsMobile } from "../useIsMobile.js";
import { GananciasCambioDeTablasChip } from "./GananciasCambioDeTablasChip.js";
import { GananciasRetentionCards } from "./GananciasRetentionCards.js";
import { GananciasRetentionTable } from "./GananciasRetentionTable.js";
import { GananciasVeredictoChip } from "./GananciasVeredictoChip.js";
import { Kpi } from "./Kpi.js";
import { KpiGrid } from "./KpiGrid.js";

interface GananciasRetentionSectionProps {
  resultado: ResultadoRetencion;
}

const pesos = (monto: number): string => formatMoney(monto, "ARS");

const titulo = (anio: number): string => `Retención de Ganancias ${anio}`;

export const GananciasRetentionSection = ({ resultado }: GananciasRetentionSectionProps) => {
  const isMobile = useIsMobile();
  const id = useId();

  if (resultado.estado === "sin_recibos") return null;

  if (resultado.estado === "sin_tablas") {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography variant="h6">{titulo(resultado.anio)}</Typography>
        <Typography color="text.secondary">{`Faltan las tablas de ARCA de ${resultado.anio}`}</Typography>
      </Box>
    );
  }

  const { anio, meses, avisos, ajusteAnioAnterior } = resultado;
  const ultimo = meses.at(-1);
  const alertas = avisos.map((aviso) => (
    <Alert key={`${aviso.tipo}-${avisoRetencionTexto(aviso, anio)}`} severity="warning">
      {avisoRetencionTexto(aviso, anio)}
    </Alert>
  ));
  const ajuste = ajusteAnioAnterior && (
    <Typography variant="body2" color="text.secondary">{ajusteAnioAnteriorTexto(ajusteAnioAnterior, anio)}</Typography>
  );
  const resumen = ultimo && (
    <>
      <GananciasVeredictoChip veredicto={ultimo.veredicto} />
      {ultimo.cambioDeTablas && <GananciasCambioDeTablasChip />}
      <Typography variant="body2" color="text.secondary">{`Último mes: ${mesDeCobroLabel(anio, ultimo.mes)}`}</Typography>
    </>
  );
  const cuentaIncompleta = avisos.length > 0 && (
    <Chip label="Cuenta incompleta" color="warning" size="small" icon={<WarningAmberIcon />} />
  );
  const lista = isMobile
    ? <GananciasRetentionCards anio={anio} meses={meses} />
    : <GananciasRetentionTable anio={anio} meses={meses} />;
  const detalle = ultimo && (
    <>
      <KpiGrid cardCount={3}>
        <Kpi label="Impuesto esperado acum." value={ultimo.esperado} format={pesos} icon={<AccountBalanceIcon />} color="primary" />
        <Kpi label="Retenido acum." value={ultimo.retenido} format={pesos} icon={<ReceiptLongIcon />} color="secondary" />
        <Kpi
          label="Diferencia"
          value={ultimo.diferencia}
          format={pesos}
          sub={veredictoRetencionLabel(ultimo.veredicto)}
          icon={<CompareArrowsIcon />}
          color={veredictoRetencionColor(ultimo.veredicto)}
        />
      </KpiGrid>
      {lista}
    </>
  );

  return (
    <Accordion variant="outlined" disableGutters slotProps={{ transition: { unmountOnExit: true } }} sx={{ mt: 4 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} id={`${id}-header`} aria-controls={`${id}-content`}>
        <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5 }}>
          <Typography variant="h6">{titulo(anio)}</Typography>
          {resumen}
          {cuentaIncompleta}
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.5} sx={{ mb: 2 }}>
          {alertas}
          {ajuste}
        </Stack>
        {detalle}
      </AccordionDetails>
    </Accordion>
  );
};
