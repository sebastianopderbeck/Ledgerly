import { Typography } from "@mui/material";
import type { PayslipDTO } from "@ledgerly/shared";
import { usePayslipTableFilters } from "../filters/usePayslipTableFilters.js";
import { useIsMobile } from "../useIsMobile.js";
import { PayslipCards } from "./PayslipCards.js";
import { PayslipFiltersBar } from "./PayslipFiltersBar.js";
import { PayslipsTable } from "./PayslipsTable.js";

interface PayslipDetailSectionProps {
  payslips: PayslipDTO[];
}

const emptyFilters = <Typography color="text.secondary">No hay recibos con estos filtros.</Typography>;

export const PayslipDetailSection = ({ payslips }: PayslipDetailSectionProps) => {
  const isMobile = useIsMobile();
  const { filters, updateFilters, visiblePayslips, periodos, orden, toggleOrden } = usePayslipTableFilters(payslips);

  if (payslips.length === 0) return null;

  const detail = isMobile
    ? <PayslipCards payslips={visiblePayslips} />
    : <PayslipsTable payslips={visiblePayslips} orden={orden} onToggleOrden={toggleOrden} />;
  const content = visiblePayslips.length === 0 ? emptyFilters : detail;

  return (
    <>
      <Typography variant="h6" sx={{ mb: 1 }}>Detalle mes a mes</Typography>
      <PayslipFiltersBar
        filters={filters} periodos={periodos} orden={orden}
        onChange={updateFilters} onToggleOrden={toggleOrden}
      />
      {content}
    </>
  );
};
