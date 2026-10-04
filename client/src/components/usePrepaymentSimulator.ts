import { useMemo, useState } from "react";
import { useCreditSummary, useMacroSeries } from "../api/hooks.js";
import {
  leerMontoTipeado, prepararSimulador, simularPrecancelacion,
  type ModoPrecancelacion, type PrecancelacionResultado, type SimuladorDatos,
} from "../uvaPrepayment.js";

export interface PrepaymentSimulator {
  datos: SimuladorDatos | null;
  monto: string;
  setMonto: (value: string) => void;
  modo: ModoPrecancelacion;
  setModo: (modo: ModoPrecancelacion) => void;
  resultado: PrecancelacionResultado | null;
  montoInvalido: boolean;
}

export function usePrepaymentSimulator(): PrepaymentSimulator {
  const { data: credito } = useCreditSummary();
  const { data: series, isLoading: cargandoSeries } = useMacroSeries();
  const [monto, setMonto] = useState("");
  const [modo, setModo] = useState<ModoPrecancelacion>("plazo");

  const datos = useMemo(
    () => (cargandoSeries ? null : prepararSimulador(credito, series)),
    [cargandoSeries, credito, series],
  );

  const resultado = useMemo(() => {
    const montoPesos = leerMontoTipeado(monto);
    if (!datos || montoPesos === null) return null;
    return simularPrecancelacion({ credito: datos.credito, montoPesos, uvaHoy: datos.uva.valor, modo });
  }, [datos, monto, modo]);

  const montoInvalido = monto.trim() !== "" && resultado === null;

  return { datos, monto, setMonto, modo, setModo, resultado, montoInvalido };
}
