import { Box } from "@mui/material";
import { formatMoney } from "../format.js";
import { mesDeCobroLabel, type MesRetencion } from "../gananciasRetencion.js";
import { GananciasCambioDeTablasChip } from "./GananciasCambioDeTablasChip.js";
import { GananciasVeredictoChip } from "./GananciasVeredictoChip.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";

interface GananciasRetentionCardsProps {
  anio: number;
  meses: MesRetencion[];
}

const pesos = (monto: number): string => formatMoney(monto, "ARS");

const highlightsOf = (mesRetencion: MesRetencion): RecordField[] => [
  { label: "Esperado acum.", value: pesos(mesRetencion.esperado) },
  { label: "Retenido acum.", value: pesos(mesRetencion.retenido) },
  { label: "Diferencia", value: pesos(mesRetencion.diferencia) },
];

const detailsOf = (mesRetencion: MesRetencion): RecordField[] => [
  { label: "Sueldos", value: mesRetencion.recibos.join(" + ") },
  { label: "Ganancia neta sujeta acum.", value: pesos(mesRetencion.gananciaNetaSujeta) },
];

export const GananciasRetentionCards = ({ anio, meses }: GananciasRetentionCardsProps) => {
  const cards = meses.map((mesRetencion) => (
    <RecordCard
      key={mesRetencion.mes}
      title={mesDeCobroLabel(anio, mesRetencion.mes)}
      badge={(
        <>
          <GananciasVeredictoChip veredicto={mesRetencion.veredicto} />
          {mesRetencion.cambioDeTablas && <GananciasCambioDeTablasChip />}
        </>
      )}
      highlights={highlightsOf(mesRetencion)}
      details={detailsOf(mesRetencion)}
    />
  ));
  return <Box sx={recordListSx}>{cards}</Box>;
};
