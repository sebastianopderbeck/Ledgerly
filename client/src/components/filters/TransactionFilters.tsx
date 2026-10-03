import { useSearchParams } from "react-router-dom";
import { MenuItem, TextField } from "@mui/material";
import { useCategories } from "../../api/hooks.js";
import { selectedValues } from "./selectedValues.js";

export const TransactionFilters = () => {
  const [params, setParams] = useSearchParams();
  const { data } = useCategories();
  const categories = Array.isArray(data) ? data : [];

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const setMulti = (key: string, values: string[]) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    for (const value of values) next.append(key, value);
    setParams(next, { replace: true });
  };

  return (
    <>
      <TextField
        select label="Categorías" size="small" sx={{ minWidth: 220 }}
        value={params.getAll("category")}
        onChange={(event) => setMulti("category", selectedValues(event.target.value))}
        SelectProps={{ multiple: true, renderValue: (selected) => selectedValues(selected).join(", ") }}
      >
        {categories.map((category) => (
          <MenuItem key={category} value={category}>{category}</MenuItem>
        ))}
      </TextField>
      <TextField
        select label="Cuotas" size="small" sx={{ minWidth: 150 }}
        value={params.get("installment") ?? ""} onChange={(event) => set("installment", event.target.value)}
      >
        <MenuItem value="">Todas</MenuItem>
        <MenuItem value="true">Solo cuotas</MenuItem>
        <MenuItem value="false">Sin cuotas</MenuItem>
      </TextField>
      <TextField
        label="Buscar comercio" size="small"
        value={params.get("search") ?? ""} onChange={(event) => set("search", event.target.value)}
      />
    </>
  );
};
