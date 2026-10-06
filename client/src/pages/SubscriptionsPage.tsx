import { useCallback, useMemo } from "react";
import { CircularProgress, Typography } from "@mui/material";
import { useSetSubscriptionHidden, useSubscriptions } from "../api/hooks.js";
import { HiddenSubscriptions } from "../components/HiddenSubscriptions.js";
import { SubscriptionCards } from "../components/SubscriptionCards.js";
import { SubscriptionKpiCards } from "../components/SubscriptionKpiCards.js";
import { SubscriptionsTable } from "../components/SubscriptionsTable.js";
import { MotionBox } from "../components/motion/motion.js";
import { fadeUpItem } from "../components/motion/variants.js";
import { formatMoney } from "../format.js";
import { subscriptionSections } from "../subscriptions.js";
import { useIsMobile } from "../useIsMobile.js";

const INTRO = "Cobros que se repiten todos los meses en tus tarjetas: al menos 3 meses seguidos, con montos parecidos. No incluye cuotas ni impuestos.";
const EMPTY = "No encontramos cobros recurrentes. Hacen falta al menos 3 meses seguidos con un cobro del mismo comercio; importá más resúmenes desde Importar.";

const Header = () => (
  <>
    <Typography variant="h4" sx={{ mb: 1 }}>Suscripciones</Typography>
    <Typography color="text.secondary" sx={{ mb: 3 }}>{INTRO}</Typography>
  </>
);

export const SubscriptionsPage = () => {
  const { data, isLoading, isError } = useSubscriptions();
  const { mutate: setHidden } = useSetSubscriptionHidden();
  const isMobile = useIsMobile();
  const sections = useMemo(() => subscriptionSections(data?.items ?? []), [data]);
  const hide = useCallback((key: string) => setHidden({ key, hidden: true }), [setHidden]);
  const show = useCallback((key: string) => setHidden({ key, hidden: false }), [setHidden]);

  if (isLoading) {
    return (
      <>
        <Header />
        <CircularProgress />
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <Header />
        <Typography color="error">No pudimos calcular las suscripciones.</Typography>
      </>
    );
  }

  if (data.items.length === 0) {
    return (
      <>
        <Header />
        <Typography color="text.secondary">{EMPTY}</Typography>
      </>
    );
  }

  const SubscriptionList = isMobile ? SubscriptionCards : SubscriptionsTable;
  const { activas, cortadas, ocultas, conUsd } = sections;
  const activeList = activas.length > 0
    ? <SubscriptionList items={activas} variant="activas" onHide={hide} />
    : <Typography color="text.secondary">No hay cobros recurrentes activos.</Typography>;
  const rateNote = conUsd && data.cotizacionOficial !== null && (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
      {`Dólares al oficial de hoy (${formatMoney(data.cotizacionOficial, "ARS")}), sin impuestos ni percepciones.`}
    </Typography>
  );
  const stoppedSection = cortadas.length > 0 && (
    <MotionBox variants={fadeUpItem} initial="hidden" animate="visible" sx={{ mt: 4 }}>
      <Typography variant="h6">Dejaron de cobrarse</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Sin cobro en el último resumen de la tarjeta.</Typography>
      <SubscriptionList items={cortadas} variant="cortadas" onHide={hide} />
    </MotionBox>
  );
  const hiddenSection = ocultas.length > 0 && <HiddenSubscriptions items={ocultas} onShow={show} />;

  return (
    <>
      <Header />
      <SubscriptionKpiCards report={data} sections={sections} />
      <Typography variant="h6" sx={{ mb: 1 }}>Activas</Typography>
      {activeList}
      {rateNote}
      {stoppedSection}
      {hiddenSection}
    </>
  );
};
