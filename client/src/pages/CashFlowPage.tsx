import { useMemo } from "react";
import { CircularProgress, Typography } from "@mui/material";
import { useCashFlow } from "../api/hooks.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { CashFlowKpiCards } from "../components/CashFlowKpiCards.js";
import { CashFlowTable } from "../components/CashFlowTable.js";
import { CashFlowCards } from "../components/CashFlowCards.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { CashFlowChart } from "../components/charts/CashFlowChart.js";
import { cashFlowYears, closedMonthsInYears, detailRows, incompleteCaption, projectionMonths } from "../cashFlow.js";
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
import { useIsMobile } from "../useIsMobile.js";

interface ChartCaptionProps {
  text: string;
}

const CASH_FLOW_FIELDS: FilterField[] = ["year"];
const ERROR_TEXT = "No se pudo calcular el flujo de caja. Probá de nuevo en un rato.";
const EMPTY_TEXT = "Para ver el flujo de caja importá tus recibos de sueldo y al menos un resumen de tarjeta desde la página Importar.";
const PROJECTION_CAPTION =
  "Sueldo con el último neto (y la mitad en junio y diciembre por el SAC), hipoteca y auto con la última cuota, y tarjetas con los resúmenes ya emitidos y, después, solo las cuotas que ya compraste. El margen es lo que te queda para consumos nuevos y gastos fuera de la tarjeta.";

const Header = () => (
  <>
    <Typography variant="h4" sx={{ mb: 0.5 }}>Flujo de caja</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
      Lo que entra por sueldo menos lo que sale sí o sí: tarjetas, hipoteca y auto.
    </Typography>
  </>
);

const ChartCaption = ({ text }: ChartCaptionProps) => (
  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
    {text}
  </Typography>
);

export const CashFlowPage = () => {
  const { data, isLoading, isError } = useCashFlow();
  const { yearSelection } = useGlobalFilters();
  const isMobile = useIsMobile();
  const meses = useMemo(() => data?.meses ?? [], [data]);
  const historia = useMemo(() => closedMonthsInYears(meses, yearSelection), [meses, yearSelection]);
  const proyeccion = useMemo(() => projectionMonths(meses), [meses]);
  const detalle = useMemo(() => detailRows(historia, proyeccion), [historia, proyeccion]);
  const yearOptions = useMemo(() => cashFlowYears(meses), [meses]);
  const monthOnly = yearSelection.kind === "years" && yearSelection.years.length === 1;

  if (isLoading) {
    return (
      <>
        <Header />
        <CircularProgress />
      </>
    );
  }

  if (isError) {
    return (
      <>
        <Header />
        <Typography color="text.secondary">{ERROR_TEXT}</Typography>
      </>
    );
  }

  if (meses.length === 0) {
    return (
      <>
        <Header />
        <Typography color="text.secondary">{EMPTY_TEXT}</Typography>
      </>
    );
  }

  const historiaCaption = incompleteCaption(historia);
  const detail = isMobile ? <CashFlowCards meses={detalle} /> : <CashFlowTable meses={detalle} />;

  return (
    <>
      <Header />
      <FiltersBar fields={CASH_FLOW_FIELDS} yearOptions={yearOptions} />
      <CashFlowKpiCards meses={meses} />
      <MotionBox
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
      >
        <ChartCard title="Ingreso, egresos y margen por mes">
          <CashFlowChart meses={historia} monthOnly={monthOnly} />
          {historiaCaption && <ChartCaption text={historiaCaption} />}
        </ChartCard>
        <ChartCard title={`Próximos ${proyeccion.length} meses (estimado)`}>
          <CashFlowChart meses={proyeccion} />
          <ChartCaption text={PROJECTION_CAPTION} />
        </ChartCard>
      </MotionBox>
      <Typography variant="h6" sx={{ mb: 1 }}>Detalle mes a mes</Typography>
      {detail}
    </>
  );
};
