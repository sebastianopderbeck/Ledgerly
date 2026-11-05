import { useMemo } from "react";
import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import type { CardServiceDTO, FixedServiceDTO } from "@ledgerly/shared";
import { useCardServices, useFixedServices } from "../api/hooks.js";
import { removeCardServiceMessage } from "../cardServices.js";
import { CardServiceCards } from "../components/CardServiceCards.js";
import { CardServicesTable } from "../components/CardServicesTable.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { FixedServiceCards } from "../components/FixedServiceCards.js";
import { FixedServiceEditor } from "../components/FixedServiceEditor.js";
import { FixedServiceKpiCards } from "../components/FixedServiceKpiCards.js";
import { FixedServicesTable } from "../components/FixedServicesTable.js";
import { useCardServiceRemoval } from "../components/useCardServiceRemoval.js";
import { useFixedServiceEditor } from "../components/useFixedServiceEditor.js";
import { tapTargetSx } from "../components/tapTarget.js";
import { fixedServiceKpis, fixedServiceSections } from "../fixedServices.js";
import { monthOf, todayIso } from "../isoDate.js";
import { useIsMobile } from "../useIsMobile.js";

interface FixedServicesHeaderProps {
  onAdd: () => void;
}

interface FixedServicesContentProps {
  services: FixedServiceDTO[];
  enTarjeta: CardServiceDTO[];
  isLoading: boolean;
  isError: boolean;
  mesActual: string;
  onEdit: (id: string) => void;
  onRemove: (item: CardServiceDTO) => void;
}

const INTRO = "Lo que pagás todos los meses: luz, gas, agua, internet, expensas. Cargá a mano lo que pagás fuera de la tarjeta; lo que llega en el resumen marcalo desde Movimientos con «Es un servicio». Se restan en el Flujo.";
const EMPTY = "Todavía no cargaste servicios. Agregá la luz, el gas o internet para que se resten en el Flujo.";
const ERROR = "No pudimos cargar los servicios.";
const NO_ACTIVE = "No hay servicios activos.";
const NO_SERVICES: FixedServiceDTO[] = [];
const NO_CARD_SERVICES: CardServiceDTO[] = [];

const headerSx: SxProps<Theme> = {
  justifyContent: "space-between",
  alignItems: { xs: "stretch", md: "center" },
  gap: 2,
  mb: 1,
};

const deleteMessage = (service: FixedServiceDTO | null): string =>
  (service ? `¿Borrar «${service.nombre}»? Se saca también de los meses pasados del Flujo.` : "");

const FixedServicesHeader = ({ onAdd }: FixedServicesHeaderProps) => (
  <>
    <Stack direction={{ xs: "column", md: "row" }} sx={headerSx}>
      <Typography variant="h4">Servicios</Typography>
      <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd} sx={tapTargetSx}>Agregar servicio</Button>
    </Stack>
    <Typography color="text.secondary" sx={{ mb: 3 }}>{INTRO}</Typography>
  </>
);

const FixedServicesContent = ({
  services, enTarjeta, isLoading, isError, mesActual, onEdit, onRemove,
}: FixedServicesContentProps) => {
  const isMobile = useIsMobile();
  const { activos, deBaja } = useMemo(() => fixedServiceSections(services, mesActual), [services, mesActual]);
  const kpis = useMemo(() => fixedServiceKpis(activos, mesActual, enTarjeta), [activos, mesActual, enTarjeta]);

  if (isLoading) return <CircularProgress />;
  if (isError) return <Typography color="error">{ERROR}</Typography>;
  if (services.length === 0 && enTarjeta.length === 0) return <Typography color="text.secondary">{EMPTY}</Typography>;

  const ServiceList = isMobile ? FixedServiceCards : FixedServicesTable;
  const CardServiceList = isMobile ? CardServiceCards : CardServicesTable;
  const activeList = activos.length > 0
    ? <ServiceList items={activos} variant="activos" onEdit={onEdit} />
    : <Typography color="text.secondary">{NO_ACTIVE}</Typography>;
  const activeSection = (activos.length > 0 || enTarjeta.length === 0) && (
    <>
      <Typography variant="h6" sx={{ mb: 1 }}>Activos</Typography>
      {activeList}
    </>
  );
  const cardSection = enTarjeta.length > 0 && (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>En la tarjeta</Typography>
      <CardServiceList items={enTarjeta} onRemove={onRemove} />
    </Box>
  );
  const stoppedSection = deBaja.length > 0 && (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Dados de baja</Typography>
      <ServiceList items={deBaja} variant="deBaja" onEdit={onEdit} />
    </Box>
  );

  return (
    <>
      <FixedServiceKpiCards kpis={kpis} />
      {activeSection}
      {cardSection}
      {stoppedSection}
    </>
  );
};

export const FixedServicesPage = () => {
  const { data, isLoading, isError } = useFixedServices();
  const cardServices = useCardServices();
  const services = data ?? NO_SERVICES;
  const enTarjeta = cardServices.data ?? NO_CARD_SERVICES;
  const mesActual = monthOf(todayIso());
  const {
    open, service, error, saving, pendingDelete, openNew, openEdit, close, save, askDelete, cancelDelete, confirmDelete,
  } = useFixedServiceEditor(services);
  const { pendingRemoval, askRemove, cancelRemove, confirmRemove } = useCardServiceRemoval();

  return (
    <>
      <FixedServicesHeader onAdd={openNew} />
      <FixedServicesContent
        services={services}
        enTarjeta={enTarjeta}
        isLoading={isLoading || cardServices.isLoading}
        isError={isError || cardServices.isError}
        mesActual={mesActual}
        onEdit={openEdit}
        onRemove={askRemove}
      />
      <FixedServiceEditor
        open={open}
        service={service}
        mesActual={mesActual}
        error={error}
        saving={saving}
        onClose={close}
        onSave={save}
        onDelete={askDelete}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Borrar servicio"
        message={deleteMessage(pendingDelete)}
        confirmLabel="Borrar"
        onConfirm={confirmDelete}
        onClose={cancelDelete}
      />
      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Quitar de Servicios"
        message={removeCardServiceMessage(pendingRemoval)}
        confirmLabel="Quitar"
        onConfirm={confirmRemove}
        onClose={cancelRemove}
      />
    </>
  );
};
