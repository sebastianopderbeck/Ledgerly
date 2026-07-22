import { useSearchParams } from "react-router-dom";
import { Box, MenuItem, TextField } from "@mui/material";
import { useCategories, useMonthly, useStatements } from "../api/hooks.js";
import { formatMonthLabel } from "../format.js";

interface FiltersBarProps { showCategory?: boolean; showMonth?: boolean; }

export const FiltersBar = ({ showCategory = false, showMonth = true }: FiltersBarProps) => {
  const [params, setParams] = useSearchParams();
  const { data } = useStatements();
  const cards = Array.isArray(data) ? [...new Set(data.map((s) => s.cardLabel))] : [];
  const { data: categoryData } = useCategories();
  const categories = Array.isArray(categoryData) ? categoryData : [];

  const currency = params.get("currency") === "USD" ? "USD" : "ARS";
  const cardLabel = params.get("cardLabel") ?? undefined;
  const { data: monthly } = useMonthly({ currency, cardLabel });
  const availableMonths = Array.isArray(monthly) ? monthly.map((m) => m.month) : [];
  const month = params.get("from")?.slice(0, 7) ?? "";
  const monthOptions = [...new Set([...(month ? [month] : []), ...availableMonths])].sort().reverse();

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
      {showMonth && (
        <TextField
          select label="Mes" size="small" sx={{ minWidth: 180 }}
          value={month} onChange={(e) => setMonth(e.target.value)}
        >
          <MenuItem value="">Todos</MenuItem>
          {monthOptions.map((m) => (
            <MenuItem key={m} value={m}>{formatMonthLabel(m)}</MenuItem>
          ))}
        </TextField>
      )}
      {showCategory && (
        <>
          <TextField
            select label="Categorías" size="small" sx={{ minWidth: 220 }}
            value={params.getAll("category")}
            onChange={(e) => setMulti("category", e.target.value as unknown as string[])}
            SelectProps={{ multiple: true, renderValue: (selected) => (selected as string[]).join(", ") }}
          >
            {categories.map((category) => (
              <MenuItem key={category} value={category}>{category}</MenuItem>
            ))}
          </TextField>
          <TextField
            select label="Cuotas" size="small" sx={{ minWidth: 150 }}
            value={params.get("installment") ?? ""} onChange={(e) => set("installment", e.target.value)}
          >
            <MenuItem value="">Todas</MenuItem>
            <MenuItem value="true">Solo cuotas</MenuItem>
            <MenuItem value="false">Sin cuotas</MenuItem>
          </TextField>
          <TextField
            label="Buscar comercio" size="small"
            value={params.get("search") ?? ""} onChange={(e) => set("search", e.target.value)}
          />
        </>
      )}
    </Box>
  );
};
