import { MenuItem, TextField } from "@mui/material";
import { useMonthly } from "../../api/hooks.js";
import { formatMonthLabel } from "../../format.js";
import { matchesYears } from "../../filters/globalFilters.js";
import { useGlobalFilters } from "../../filters/useGlobalFilters.js";

export const MonthFilter = () => {
  const { yearSelection, currency, cardLabel, from, setMonth } = useGlobalFilters();
  const { data } = useMonthly({ currency, cardLabel });
  const month = from?.slice(0, 7) ?? "";
  const availableMonths = Array.isArray(data) ? data.map((row) => row.month) : [];
  const monthsInYears = availableMonths.filter((value) => matchesYears(value, yearSelection));
  const options = [...new Set([...(month ? [month] : []), ...monthsInYears])].sort().reverse();

  return (
    <TextField
      select label="Mes" size="small" sx={{ minWidth: 180 }}
      value={month} onChange={(event) => setMonth(event.target.value)}
    >
      <MenuItem value="">Todos</MenuItem>
      {options.map((option) => (
        <MenuItem key={option} value={option}>{formatMonthLabel(option)}</MenuItem>
      ))}
    </TextField>
  );
};
