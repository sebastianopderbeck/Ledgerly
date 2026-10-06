import { useCallback, useMemo, useState, type MouseEvent } from "react";
import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import { DETALLE_VISTA_LABEL, DETALLE_VISTAS, detailRows, type DetalleVista } from "../cashFlow.js";
import { useIsMobile } from "../useIsMobile.js";
import { CashFlowCards } from "./CashFlowCards.js";
import { CashFlowTable } from "./CashFlowTable.js";
import { MIN_TAP_SIZE } from "./tapTarget.js";

interface CashFlowDetailSectionProps {
  meses: CashFlowMonthDTO[];
  historia: CashFlowMonthDTO[];
}

const EMPTY_TEXT = "No hay meses para mostrar.";

const headerSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: { xs: "column", md: "row" },
  alignItems: { xs: "stretch", md: "center" },
  justifyContent: "space-between",
  gap: 1.5,
  mb: 1,
};

const toggleGroupSx: SxProps<Theme> = { width: { xs: "100%", md: "auto" } };

const toggleButtonSx: SxProps<Theme> = { flex: { xs: 1, md: "none" }, minHeight: { xs: MIN_TAP_SIZE, md: 0 }, px: 2 };

export const CashFlowDetailSection = ({ meses, historia }: CashFlowDetailSectionProps) => {
  const [vista, setVista] = useState<DetalleVista>("actual");
  const isMobile = useIsMobile();
  const rows = useMemo(() => detailRows(meses, historia, vista), [meses, historia, vista]);

  const cambiarVista = useCallback((_event: MouseEvent<HTMLElement>, valor: DetalleVista | null) => {
    if (valor !== null) setVista(valor);
  }, []);

  const toggleButtons = DETALLE_VISTAS.map((opcion) => (
    <ToggleButton key={opcion} value={opcion} sx={toggleButtonSx}>{DETALLE_VISTA_LABEL[opcion]}</ToggleButton>
  ));
  const list = isMobile ? <CashFlowCards meses={rows} /> : <CashFlowTable meses={rows} />;
  const content = rows.length === 0 ? <Typography color="text.secondary">{EMPTY_TEXT}</Typography> : list;

  return (
    <>
      <Box sx={headerSx}>
        <Typography variant="h6">Detalle mes a mes</Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={vista}
          onChange={cambiarVista}
          aria-label="Meses a mostrar"
          sx={toggleGroupSx}
        >
          {toggleButtons}
        </ToggleButtonGroup>
      </Box>
      {content}
    </>
  );
};
