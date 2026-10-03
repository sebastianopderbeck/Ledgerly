import { useState, type ChangeEvent } from "react";
import { Box, Button, IconButton, TextField } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { formatMoneyOrDash } from "../format.js";
import { BottomSheet } from "./BottomSheet.js";
import { MIN_TAP_SIZE, tapTargetSx } from "./tapTarget.js";

interface RateSheetProps {
  open: boolean;
  title: string;
  formKey: string;
  current: number | null;
  onSave: (rate: number) => void;
  onClose: () => void;
}

interface RateFormProps {
  current: number | null;
  onSave: (rate: number) => void;
  onClose: () => void;
}

interface RateValueProps {
  rate: number | null;
  editLabel: string;
  onEdit: () => void;
}

const pencilSx = { p: 1, minWidth: MIN_TAP_SIZE, minHeight: MIN_TAP_SIZE };

export const parseRate = (value: string): number => Number(value.trim().replace(",", "."));

export const canSaveRate = (rate: number, current: number | null): boolean => rate > 0 && rate !== current;

const RateForm = ({ current, onSave, onClose }: RateFormProps) => {
  const [value, setValue] = useState(current === null ? "" : String(current));
  const rate = parseRate(value);
  const saveable = canSaveRate(rate, current);

  const change = (event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value);

  const save = () => {
    if (!saveable) return;
    onSave(rate);
    onClose();
  };

  return (
    <>
      <TextField
        label="TC oficial"
        fullWidth
        value={value}
        onChange={change}
        slotProps={{ htmlInput: { inputMode: "decimal" } }}
        sx={{ mt: 1 }}
      />
      <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
        <Button fullWidth onClick={onClose} sx={tapTargetSx}>Cancelar</Button>
        <Button fullWidth variant="contained" disabled={!saveable} onClick={save} sx={tapTargetSx}>Guardar</Button>
      </Box>
    </>
  );
};

export const RateSheet = ({ open, title, formKey, current, onSave, onClose }: RateSheetProps) => (
  <BottomSheet open={open} onClose={onClose} title={title}>
    <RateForm key={formKey} current={current} onSave={onSave} onClose={onClose} />
  </BottomSheet>
);

export const RateValue = ({ rate, editLabel, onEdit }: RateValueProps) => (
  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
    {formatMoneyOrDash(rate, "ARS")}
    <IconButton size="small" aria-label={editLabel} onClick={onEdit} sx={pencilSx}>
      <EditIcon fontSize="small" />
    </IconButton>
  </Box>
);
