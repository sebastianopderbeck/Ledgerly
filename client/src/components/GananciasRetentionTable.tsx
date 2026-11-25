import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { formatMoney } from "../format.js";
import { mesDeCobroLabel, type MesRetencion } from "../gananciasRetencion.js";
import { GananciasCambioDeTablasChip } from "./GananciasCambioDeTablasChip.js";
import { GananciasVeredictoChip } from "./GananciasVeredictoChip.js";

interface GananciasRetentionTableProps {
  anio: number;
  meses: MesRetencion[];
}

const pesos = (monto: number): string => formatMoney(monto, "ARS");

export const GananciasRetentionTable = ({ anio, meses }: GananciasRetentionTableProps) => {
  const rows = meses.map((mesRetencion) => (
    <TableRow key={mesRetencion.mes}>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {mesDeCobroLabel(anio, mesRetencion.mes)}
          {mesRetencion.cambioDeTablas && <GananciasCambioDeTablasChip />}
        </Box>
      </TableCell>
      <TableCell>{mesRetencion.recibos.join(" + ")}</TableCell>
      <TableCell align="right">{pesos(mesRetencion.gananciaNetaSujeta)}</TableCell>
      <TableCell align="right">{pesos(mesRetencion.esperado)}</TableCell>
      <TableCell align="right">{pesos(mesRetencion.retenido)}</TableCell>
      <TableCell align="right">{pesos(mesRetencion.diferencia)}</TableCell>
      <TableCell align="right"><GananciasVeredictoChip veredicto={mesRetencion.veredicto} /></TableCell>
    </TableRow>
  ));

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Mes de cobro</TableCell>
            <TableCell>Sueldos</TableCell>
            <TableCell align="right">Ganancia neta sujeta acum.</TableCell>
            <TableCell align="right">Esperado acum.</TableCell>
            <TableCell align="right">Retenido acum.</TableCell>
            <TableCell align="right">Diferencia</TableCell>
            <TableCell align="right">Veredicto</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>{rows}</TableBody>
      </Table>
    </TableContainer>
  );
};
