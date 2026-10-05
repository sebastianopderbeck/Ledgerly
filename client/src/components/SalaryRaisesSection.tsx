import { useId } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Box, MenuItem, TextField, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useRaiseFilters } from "../filters/useRaiseFilters.js";
import { isRaiseVerdictFilter, RAISE_VERDICT_OPTIONS } from "../salaryFilters.js";
import type { SalaryRaise } from "../salaryRaises.js";
import { useIsMobile } from "../useIsMobile.js";
import { PeriodoSortButton } from "./PeriodoSortButton.js";
import { SalaryRaiseCards } from "./SalaryRaiseCards.js";
import { SalaryRaisesTable } from "./SalaryRaisesTable.js";

interface SalaryRaisesSectionProps {
  raises: SalaryRaise[];
}

const emptyVerdict = <Typography color="text.secondary">No hay ajustes con este veredicto.</Typography>;

const verdictOptions = RAISE_VERDICT_OPTIONS.map(({ value, label }) => (
  <MenuItem key={value} value={value}>{label}</MenuItem>
));

export const SalaryRaisesSection = ({ raises }: SalaryRaisesSectionProps) => {
  const isMobile = useIsMobile();
  const id = useId();
  const { verdict, setVerdict, visibleRaises, orden, toggleOrden } = useRaiseFilters(raises);

  if (raises.length === 0) return null;

  const list = isMobile
    ? <SalaryRaiseCards raises={visibleRaises} />
    : <SalaryRaisesTable raises={visibleRaises} orden={orden} onToggleOrden={toggleOrden} />;
  const content = visibleRaises.length === 0 ? emptyVerdict : list;

  return (
    <Accordion variant="outlined" disableGutters slotProps={{ transition: { unmountOnExit: true } }} sx={{ mt: 4 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} id={`${id}-header`} aria-controls={`${id}-content`}>
        <Typography variant="h6">Ajustes vs IPC ({raises.length})</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
          <TextField
            select label="Veredicto" size="small" sx={{ minWidth: 160 }}
            value={verdict}
            onChange={(event) => { if (isRaiseVerdictFilter(event.target.value)) setVerdict(event.target.value); }}
          >
            {verdictOptions}
          </TextField>
          {isMobile && <PeriodoSortButton orden={orden} onToggle={toggleOrden} />}
        </Box>
        {content}
      </AccordionDetails>
    </Accordion>
  );
};
