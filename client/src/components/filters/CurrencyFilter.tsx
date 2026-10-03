import { MenuItem, TextField } from "@mui/material";
import { useGlobalFilters } from "../../filters/useGlobalFilters.js";

export const CurrencyFilter = () => {
  const { currency, setCurrency } = useGlobalFilters();

  return (
    <TextField
      select label="Moneda" size="small" sx={{ minWidth: 120 }}
      value={currency} onChange={(event) => setCurrency(event.target.value === "USD" ? "USD" : "ARS")}
    >
      <MenuItem value="ARS">ARS</MenuItem>
      <MenuItem value="USD">USD</MenuItem>
    </TextField>
  );
};
