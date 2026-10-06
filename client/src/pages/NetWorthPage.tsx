import { useMemo } from "react";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import type { ManualAssetDTO, NetWorthDTO } from "@ledgerly/shared";
import { useNetWorth } from "../api/hooks.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { ManualAssetEditor } from "../components/ManualAssetEditor.js";
import { NetWorthEvolutionCard } from "../components/NetWorthEvolutionCard.js";
import { NetWorthItemsCard } from "../components/NetWorthItemsCard.js";
import { NetWorthKpiCards } from "../components/NetWorthKpiCards.js";
import { useManualAssetEditor } from "../components/useManualAssetEditor.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { tapTargetSx } from "../components/tapTarget.js";
import { matchesYears, yearsOf } from "../filters/globalFilters.js";
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
import { todayIso } from "../isoDate.js";
import { itemsBySide, missingPropertyHint } from "../netWorth.js";

interface NetWorthHeaderProps {
  onAdd: () => void;
}

interface NetWorthContentProps {
  data: NetWorthDTO | null | undefined;
  isLoading: boolean;
  error: Error | null;
  onEdit: (assetId: string) => void;
}

interface NetWorthViewProps {
  data: NetWorthDTO;
  onEdit: (assetId: string) => void;
}

const NET_WORTH_FIELDS: FilterField[] = ["year"];
const NO_ASSETS: ManualAssetDTO[] = [];

const EMPTY_MESSAGE =
  "Todavía no hay nada para valuar. Importá cupones del auto o de la hipoteca, resúmenes de tarjeta, o agregá un activo a mano.";
const PROPERTY_HINT =
  "Tenés una hipoteca pero ningún inmueble entre tus activos. Agregá la casa como activo de tipo Inmueble para que el patrimonio no quede subestimado.";
const EMPTY_ASSETS = "Sin activos: agregá tus ahorros, plazos fijos o inversiones.";
const EMPTY_LIABILITIES = "Sin deudas registradas.";

const headerSx: SxProps<Theme> = {
  justifyContent: "space-between",
  alignItems: { xs: "stretch", md: "center" },
  gap: 2,
  mb: 3,
};
const gridSx: SxProps<Theme> = { display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 };
const fullRowSx: SxProps<Theme> = { gridColumn: "1 / -1" };

const deleteMessage = (asset: ManualAssetDTO | null): string =>
  (asset ? `¿Borrar «${asset.nombre}» y todas sus valuaciones? Esta acción no se puede deshacer.` : "");

const NetWorthHeader = ({ onAdd }: NetWorthHeaderProps) => (
  <Stack direction={{ xs: "column", md: "row" }} sx={headerSx}>
    <Typography variant="h4">Patrimonio</Typography>
    <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd} sx={tapTargetSx}>Agregar activo</Button>
  </Stack>
);

const NetWorthView = ({ data, onEdit }: NetWorthViewProps) => {
  const { yearSelection } = useGlobalFilters();
  const yearOptions = useMemo(() => yearsOf(data.evolucion.map((mes) => mes.periodo)), [data]);
  const { activos, pasivos } = useMemo(() => itemsBySide(data.items), [data]);
  const months = useMemo(
    () => data.evolucion.filter((mes) => matchesYears(mes.periodo, yearSelection)),
    [data, yearSelection],
  );
  const filters = data.evolucion.length > 0 && <FiltersBar fields={NET_WORTH_FIELDS} yearOptions={yearOptions} />;
  const propertyHint = missingPropertyHint(data) && <Alert severity="info" sx={{ mb: 3 }}>{PROPERTY_HINT}</Alert>;

  return (
    <>
      {filters}
      <NetWorthKpiCards data={data} />
      {propertyHint}
      <MotionBox variants={staggerContainer} initial="hidden" animate="visible" sx={gridSx}>
        <NetWorthItemsCard
          title="Activos"
          items={activos}
          totalArs={data.totales.activosArs}
          totalUsd={data.totales.activosUsd}
          emptyText={EMPTY_ASSETS}
          onEdit={onEdit}
        />
        <NetWorthItemsCard
          title="Pasivos"
          items={pasivos}
          totalArs={data.totales.pasivosArs}
          totalUsd={data.totales.pasivosUsd}
          emptyText={EMPTY_LIABILITIES}
          onEdit={onEdit}
        />
        <Box sx={fullRowSx}>
          <NetWorthEvolutionCard months={months} />
        </Box>
      </MotionBox>
    </>
  );
};

const NetWorthContent = ({ data, isLoading, error, onEdit }: NetWorthContentProps) => {
  if (isLoading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error.message}</Alert>;
  if (!data) return <Typography color="text.secondary">{EMPTY_MESSAGE}</Typography>;
  return <NetWorthView data={data} onEdit={onEdit} />;
};

export const NetWorthPage = () => {
  const { data, isLoading, error } = useNetWorth();
  const assets = data?.activosManuales ?? NO_ASSETS;
  const {
    open, asset, error: editorError, saving, pendingDelete,
    openNew, openEdit, close, save, askDelete, cancelDelete, confirmDelete, deleteValuation,
  } = useManualAssetEditor(assets);

  return (
    <>
      <NetWorthHeader onAdd={openNew} />
      <NetWorthContent data={data} isLoading={isLoading} error={error} onEdit={openEdit} />
      <ManualAssetEditor
        open={open}
        asset={asset}
        today={todayIso()}
        error={editorError}
        saving={saving}
        onClose={close}
        onSave={save}
        onDelete={askDelete}
        onDeleteValuation={deleteValuation}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Borrar activo"
        message={deleteMessage(pendingDelete)}
        confirmLabel="Borrar"
        onConfirm={confirmDelete}
        onClose={cancelDelete}
      />
    </>
  );
};
