import { Box, Chip, IconButton, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { formatMonthLabel } from "../format.js";
import { iconTapTargetSx } from "./tapTarget.js";

interface BudgetMonthPickerProps {
  month: string;
  months: string[];
  partial: boolean;
  onChange: (month: string) => void;
}

const PARTIAL_NOTE = "Mes parcial: faltan consumos que llegan con el próximo resumen.";

export const BudgetMonthPicker = ({ month, months, partial, onChange }: BudgetMonthPickerProps) => {
  const index = months.indexOf(month);
  const previous = index > 0 ? months[index - 1] : null;
  const next = index >= 0 && index < months.length - 1 ? months[index + 1] : null;

  const goPrevious = () => {
    if (previous) onChange(previous);
  };
  const goNext = () => {
    if (next) onChange(next);
  };

  const partialChip = partial && <Chip size="small" variant="outlined" label="Parcial" />;
  const partialNote = partial && (
    <Typography variant="caption" color="text.secondary" component="p" sx={{ textAlign: "center", mt: 0.5 }}>
      {PARTIAL_NOTE}
    </Typography>
  );

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
        <IconButton aria-label="mes anterior" onClick={goPrevious} disabled={previous === null} sx={iconTapTargetSx}>
          <ChevronLeftIcon />
        </IconButton>
        <Box
          aria-live="polite"
          sx={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 1, minWidth: 0 }}
        >
          <Typography variant="h6" component="p">{formatMonthLabel(month)}</Typography>
          {partialChip}
        </Box>
        <IconButton aria-label="mes siguiente" onClick={goNext} disabled={next === null} sx={iconTapTargetSx}>
          <ChevronRightIcon />
        </IconButton>
      </Box>
      {partialNote}
    </Box>
  );
};
