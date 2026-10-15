import { useMemo } from "react";
import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import type { FixedServiceDTO } from "@ledgerly/shared";
import { useFixedServices } from "../api/hooks.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { FixedServiceCards } from "../components/FixedServiceCards.js";
import { FixedServiceEditor } from "../components/FixedServiceEditor.js";
import { FixedServiceKpiCards } from "../components/FixedServiceKpiCards.js";
import { FixedServicesTable } from "../components/FixedServicesTable.js";
import { useFixedServiceEditor } from "../components/useFixedServiceEditor.js";
import { tapTargetSx } from "../components/tapTarget.js";
import { fixedServiceSections } from "../fixedServices.js";
import { monthOf, todayIso } from "../isoDate.js";
import { useIsMobile } from "../useIsMobile.js";

interface FixedServicesHeaderProps {
  onAdd: () => void;
}

interface FixedServicesContentProps {
  services: FixedServiceDTO[];
  isLoading: boolean;
  isError: boolean;
  mesActual: string;
  onEdit: (id: string) => void;
}

const INTRO = "Lo que pagás fuera de la tarjeta (luz, gas, agua, internet, expensas). Se restan en el Flujo desde el mes que elijas.";
const EMPTY = "Todavía no cargaste servicios. Agregá la luz, el gas o internet para que se resten en el Flujo.";
const ERROR = "No pudimos cargar los servicios.";
const NO_ACTIVE = "No hay servicios activos.";
const NO_SERVICES: FixedServiceDTO[] = [];

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

const FixedServicesContent = ({ services, isLoading, isError, mesActual, onEdit }: FixedServicesContentProps) => {
  const isMobile = useIsMobile();
  const { activos, deBaja } = useMemo(() => fixedServiceSections(services, mesActual), [services, mesActual]);

  if (isLoading) return <CircularProgress />;
  if (isError) return <Typography color="error">{ERROR}</Typography>;
  if (services.length === 0) return <Typography color="text.secondary">{EMPTY}</Typography>;

  const ServiceList = isMobile ? FixedServiceCards : FixedServicesTable;
  const activeList = activos.length > 0
    ? <ServiceList items={activos} variant="activos" onEdit={onEdit} />
    : <Typography color="text.secondary">{NO_ACTIVE}</Typography>;
  const stoppedSection = deBaja.length > 0 && (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Dados de baja</Typography>
      <ServiceList items={deBaja} variant="deBaja" onEdit={onEdit} />
    </Box>
  );

  return (
    <>
      <FixedServiceKpiCards activos={activos} />
      <Typography variant="h6" sx={{ mb: 1 }}>Activos</Typography>
      {activeList}
      {stoppedSection}
    </>
  );
};

export const FixedServicesPage = () => {
  const { data, isLoading, isError } = useFixedServices();
  const services = data ?? NO_SERVICES;
  const mesActual = monthOf(todayIso());
  const {
    open, service, error, saving, pendingDelete, openNew, openEdit, close, save, askDelete, cancelDelete, confirmDelete,
  } = useFixedServiceEditor(services);

  return (
    <>
      <FixedServicesHeader onAdd={openNew} />
      <FixedServicesContent services={services} isLoading={isLoading} isError={isError} mesActual={mesActual} onEdit={openEdit} />
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
    </>
  );
};
