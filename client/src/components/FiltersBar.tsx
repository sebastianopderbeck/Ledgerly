import { useSearchParams } from "react-router-dom";
import { Box, MenuItem, TextField } from "@mui/material";
import { useStatements } from "../api/hooks.js";

interface FiltersBarProps { showCategory?: boolean; }

export const FiltersBar = ({ showCategory = false }: FiltersBarProps) => {
  const [params, setParams] = useSearchParams();
  const { data } = useStatements();
  const cards = Array.isArray(data) ? [...new Set(data.map((s) => s.cardLabel))] : [];

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
      <TextField
        select label="Moneda" size="small" sx={{ minWidth: 120 }}
        value={params.get("currency") ?? "ARS"} onChange={(e) => set("currency", e.target.value)}
      >
        <MenuItem value="ARS">ARS</MenuItem>
        <MenuItem value="USD">USD</MenuItem>
      </TextField>
      <TextField
        select label="Tarjeta" size="small" sx={{ minWidth: 200 }}
        value={params.get("cardLabel") ?? ""} onChange={(e) => set("cardLabel", e.target.value)}
      >
        <MenuItem value="">Todas</MenuItem>
        {cards.map((card) => (
          <MenuItem key={card} value={card}>{card}</MenuItem>
        ))}
      </TextField>
      <TextField
        label="Desde" type="date" size="small" InputLabelProps={{ shrink: true }}
        value={params.get("from") ?? ""} onChange={(e) => set("from", e.target.value)}
      />
      <TextField
        label="Hasta" type="date" size="small" InputLabelProps={{ shrink: true }}
        value={params.get("to") ?? ""} onChange={(e) => set("to", e.target.value)}
      />
      {showCategory && (
        <TextField
          label="Buscar comercio" size="small"
          value={params.get("search") ?? ""} onChange={(e) => set("search", e.target.value)}
        />
      )}
    </Box>
  );
};
