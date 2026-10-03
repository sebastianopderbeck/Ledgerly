import { MenuItem, TextField } from "@mui/material";
import { useStatements } from "../../api/hooks.js";
import { useGlobalFilters } from "../../filters/useGlobalFilters.js";

export const CardFilter = () => {
  const { cardLabel, setCardLabel } = useGlobalFilters();
  const { data } = useStatements();
  const cards = Array.isArray(data) ? [...new Set(data.map((statement) => statement.cardLabel))] : [];

  return (
    <TextField
      select label="Tarjeta" size="small" sx={{ minWidth: 200 }}
      value={cardLabel ?? ""} onChange={(event) => setCardLabel(event.target.value)}
    >
      <MenuItem value="">Todas</MenuItem>
      {cards.map((card) => (
        <MenuItem key={card} value={card}>{card}</MenuItem>
      ))}
    </TextField>
  );
};
