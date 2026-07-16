import { useSearchParams } from "react-router-dom";
import { Box, MenuItem, TextField } from "@mui/material";
import { useMonthly, useStatements } from "../api/hooks.js";

interface FiltersBarProps { showCategory?: boolean; }

const formatMonthLabel = (value: string) => {
  const [year, monthNumber] = value.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export const FiltersBar = ({ showCategory = false }: FiltersBarProps) => {
  const [params, setParams] = useSearchParams();
  const { data } = useStatements();
  const cards = Array.isArray(data) ? [...new Set(data.map((s) => s.cardLabel))] : [];

  const currency = params.get("currency") === "USD" ? "USD" : "ARS";
  const cardLabel = params.get("cardLabel") ?? undefined;
  const { data: monthly } = useMonthly({ currency, cardLabel });
  const month = params.get("from")?.slice(0, 7) ?? "";
  const monthOptions = [...new Set([...(month ? [month] : []), ...(monthly ?? []).map((m) => m.month)])].sort().reverse();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const setMonth = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) {
      const [year, monthNumber] = value.split("-").map(Number);
      const lastDay = new Date(year, monthNumber, 0).getDate();
      next.set("from", `${value}-01`);
      next.set("to", `${value}-${String(lastDay).padStart(2, "0")}`);
    } else {
      next.delete("from");
      next.delete("to");
    }
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
        select label="Mes" size="small" sx={{ minWidth: 180 }}
        value={month} onChange={(e) => setMonth(e.target.value)}
      >
        <MenuItem value="">Todos</MenuItem>
        {monthOptions.map((m) => (
          <MenuItem key={m} value={m}>{formatMonthLabel(m)}</MenuItem>
        ))}
      </TextField>
      {showCategory && (
        <TextField
          label="Buscar comercio" size="small"
          value={params.get("search") ?? ""} onChange={(e) => set("search", e.target.value)}
        />
      )}
    </Box>
  );
};
