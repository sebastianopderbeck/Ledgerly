import { useCallback, useId, type ChangeEvent, type MouseEvent } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert, Box, Button, Card, CardContent, InputAdornment, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import {
  resultadoTiles, textoAyudaMonto, textoCancelacionTotal, textoLetraChica, textoSaldo,
  type LecturaVeredicto, type ModoPrecancelacion, type PrecancelacionResultado, type SimuladorTile,
} from "../uvaPrepayment.js";
import { useIsMobile } from "../useIsMobile.js";
import { useNavSearch } from "./layout/useNavSearch.js";
import { MotionBox } from "./motion/motion.js";
import { fadeUpItem } from "./motion/variants.js";
import { compactCardContentSx } from "./compactCardContentSx.js";
import { tapTargetSx } from "./tapTarget.js";
import { usePrepaymentSimulator } from "./usePrepaymentSimulator.js";

const TITULO = "Simulador de precancelación";

const MODOS: { value: ModoPrecancelacion; label: string }[] = [
  { value: "plazo", label: "Reducir plazo" },
  { value: "cuota", label: "Reducir cuota" },
];

interface SimuladorTileBoxProps {
  tile: SimuladorTile;
}

const SimuladorTileBox = ({ tile }: SimuladorTileBoxProps) => {
  const labelId = useId();
  return (
    <Box role="group" aria-labelledby={labelId} sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1.5, minWidth: 0 }}>
      <Typography id={labelId} variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
        {tile.label}
      </Typography>
      <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>{tile.value}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{tile.sub}</Typography>
    </Box>
  );
};

interface ResultadoSimulacionProps {
  resultado: PrecancelacionResultado | null;
  uvaHoy: number;
}

const ResultadoSimulacion = ({ resultado, uvaHoy }: ResultadoSimulacionProps) => {
  if (!resultado) {
    return <Typography color="text.secondary">Ingresá un monto para ver cuánto te ahorrás.</Typography>;
  }

  const tiles = resultadoTiles(resultado);
  const avisoCancelacion = resultado.cancelaTodo ? textoCancelacionTotal(resultado, uvaHoy) : null;

  return (
    <>
      {avisoCancelacion && <Alert severity="success" sx={{ mb: 2 }}>{avisoCancelacion}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
        {tiles.map((item) => <SimuladorTileBox key={item.id} tile={item} />)}
      </Box>
    </>
  );
};

interface VeredictoContextoProps {
  veredicto: LecturaVeredicto;
}

const VeredictoContexto = ({ veredicto }: VeredictoContextoProps) => {
  const isMobile = useIsMobile();
  const navSearch = useNavSearch();
  const severidad = veredicto.estado === "mejor" ? "success" : "info";
  const leyenda = veredicto.estado === "sinComparar" ? null : (
    <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
      Ranking con los supuestos por defecto de Contexto.
    </Typography>
  );
  const verContexto = (
    <Button
      component={RouterLink}
      to={{ pathname: "/contexto", search: navSearch }}
      color="inherit"
      size="small"
      fullWidth={isMobile}
      sx={isMobile ? tapTargetSx : undefined}
    >
      Ver Contexto
    </Button>
  );

  if (isMobile) {
    return (
      <Alert severity={severidad} sx={{ mt: 2 }}>
        {veredicto.texto}
        {leyenda}
        <Box sx={{ mt: 1 }}>{verContexto}</Box>
      </Alert>
    );
  }

  return (
    <Alert severity={severidad} sx={{ mt: 2 }} action={verContexto}>
      {veredicto.texto}
      {leyenda}
    </Alert>
  );
};

export const PrepaymentSimulatorCard = () => {
  const { datos, monto, setMonto, modo, setModo, resultado, montoInvalido } = usePrepaymentSimulator();
  const isMobile = useIsMobile();
  const titleId = useId();

  const handleMonto = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setMonto(event.target.value),
    [setMonto],
  );
  const handleModo = useCallback(
    (_event: MouseEvent<HTMLElement>, value: ModoPrecancelacion | null) => {
      if (value !== null) setModo(value);
    },
    [setModo],
  );

  if (!datos) return null;

  const toggleSx = isMobile ? tapTargetSx : undefined;

  return (
    <MotionBox variants={fadeUpItem} initial="hidden" animate="visible">
      <Card component="section" aria-labelledby={titleId} sx={{ mb: 3 }}>
        <CardContent sx={compactCardContentSx}>
          <Typography id={titleId} variant="h6">{TITULO}</Typography>
          <Typography variant="body2" color="text.secondary">
            Cuánto te ahorrás si adelantás capital hoy. No se guarda nada.
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            {textoSaldo(datos)}
          </Typography>

          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              alignItems: { xs: "stretch", md: "flex-start" },
              gap: 2,
              mt: 2,
              mb: 2,
            }}
          >
            <TextField
              label="Monto a adelantar"
              value={monto}
              onChange={handleMonto}
              error={montoInvalido}
              helperText={textoAyudaMonto(resultado, datos.uva, montoInvalido)}
              fullWidth={isMobile}
              sx={{ width: { md: 280 }, flexShrink: 0 }}
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                htmlInput: { inputMode: "decimal" },
              }}
            />
            <ToggleButtonGroup exclusive value={modo} onChange={handleModo} aria-label="Qué reducir" fullWidth={isMobile}>
              {MODOS.map((opcion) => (
                <ToggleButton key={opcion.value} value={opcion.value} sx={toggleSx}>{opcion.label}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          <ResultadoSimulacion resultado={resultado} uvaHoy={datos.uva.valor} />
          <VeredictoContexto veredicto={datos.veredicto} />

          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
            {textoLetraChica(datos.comisionHastaCuota)}
          </Typography>
        </CardContent>
      </Card>
    </MotionBox>
  );
};
