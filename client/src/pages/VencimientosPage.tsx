import { useCallback, useMemo, type MouseEvent } from "react";
import { Alert, Box, CircularProgress, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { VencimientosList } from "../components/VencimientosList.js";
import { MIN_TAP_SIZE } from "../components/tapTarget.js";
import { formatDayOfMonthLong } from "../isoDate.js";
import { useStoredState } from "../useStoredState.js";
import { useVencimientos } from "../useVencimientos.js";
import { agruparVencimientos, isAgrupacion, notaSinEstimar, type Agrupacion } from "../vencimientos.js";

const AGRUPACION_KEY = "ledgerly.vencimientosAgrupacion";

const LEYENDA =
  "Confirmado: la fecha sale de un documento importado. Estimado: se proyecta del patrón de los últimos documentos; los montos estimados llevan ≈.";

const headerSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: { xs: "column", md: "row" },
  alignItems: { xs: "stretch", md: "center" },
  justifyContent: "space-between",
  gap: 1.5,
  maxWidth: 840,
  mb: 1,
};

const toggleGroupSx: SxProps<Theme> = { width: { xs: "100%", md: "auto" } };

const toggleButtonSx: SxProps<Theme> = { flex: { xs: 1, md: "none" }, minHeight: { xs: MIN_TAP_SIZE, md: 0 }, px: 2 };

const leyendaSx: SxProps<Theme> = { display: "block", maxWidth: 840, mb: 2 };

const notaSx: SxProps<Theme> = { display: "block", maxWidth: 840, mt: 2 };

const Title = () => <Typography variant="h4" sx={{ mb: 3 }}>Vencimientos</Typography>;

export const VencimientosPage = () => {
  const { isLoading, isError, hasDocuments, hoy, view } = useVencimientos();
  const [agrupacion, setAgrupacion] = useStoredState<Agrupacion>(AGRUPACION_KEY, "semana", isAgrupacion);
  const grupos = useMemo(() => agruparVencimientos(view.items, agrupacion, hoy), [view.items, agrupacion, hoy]);

  const cambiarAgrupacion = useCallback((_event: MouseEvent<HTMLElement>, valor: Agrupacion | null) => {
    if (valor !== null) setAgrupacion(valor);
  }, [setAgrupacion]);

  if (isLoading) {
    return (
      <>
        <Title />
        <CircularProgress />
      </>
    );
  }

  if (isError) {
    return (
      <>
        <Title />
        <Alert severity="error">No se pudieron cargar los vencimientos. Probá de nuevo en un rato.</Alert>
      </>
    );
  }

  if (!hasDocuments) {
    return (
      <>
        <Title />
        <Typography color="text.secondary">
          Todavía no importaste resúmenes, cupones ni recibos. Subilos desde la página Importar.
        </Typography>
      </>
    );
  }

  const hasta = formatDayOfMonthLong(view.rango.hasta);
  const nota = notaSinEstimar(view.sinEstimar);
  const contenido = grupos.length === 0
    ? <Typography color="text.secondary">{`No hay pagos ni cobros entre hoy y el ${hasta}.`}</Typography>
    : <VencimientosList key={agrupacion} grupos={grupos} hoy={hoy} />;

  return (
    <>
      <Title />
      <Box sx={headerSx}>
        <Typography variant="body2" color="text.secondary">{`De hoy al ${hasta}.`}</Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={agrupacion}
          onChange={cambiarAgrupacion}
          aria-label="Agrupar por"
          sx={toggleGroupSx}
        >
          <ToggleButton value="semana" sx={toggleButtonSx}>Semana</ToggleButton>
          <ToggleButton value="mes" sx={toggleButtonSx}>Mes</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={leyendaSx}>{LEYENDA}</Typography>
      {contenido}
      {nota && <Typography variant="caption" color="text.secondary" sx={notaSx}>{nota}</Typography>}
    </>
  );
};
