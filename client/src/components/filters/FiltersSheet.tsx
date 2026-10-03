import { Box, Button } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { FilterField } from "../../filters/activeFilters.js";
import { BottomSheet } from "../BottomSheet.js";
import { FilterFields } from "./FilterFields.js";

interface FiltersSheetProps {
  open: boolean;
  onClose: () => void;
  fields: FilterField[];
  yearOptions: string[];
}

const stackSx: SxProps<Theme> = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  pt: 1.5,
  "& > *": { width: "100%" },
};

export const FiltersSheet = ({ open, onClose, fields, yearOptions }: FiltersSheetProps) => {
  const actions = <Button variant="contained" fullWidth onClick={onClose} sx={{ minHeight: 44 }}>Listo</Button>;

  return (
    <BottomSheet open={open} onClose={onClose} title="Filtros" actions={actions}>
      <Box sx={stackSx}>
        <FilterFields fields={fields} yearOptions={yearOptions} withSearch={false} />
      </Box>
    </BottomSheet>
  );
};
