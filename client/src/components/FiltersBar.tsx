import { Box } from "@mui/material";
import { YearFilter } from "./filters/YearFilter.js";
import { CurrencyFilter } from "./filters/CurrencyFilter.js";
import { CardFilter } from "./filters/CardFilter.js";
import { MonthFilter } from "./filters/MonthFilter.js";
import { TransactionFilters } from "./filters/TransactionFilters.js";

export type FilterField = "year" | "currency" | "card" | "month" | "transaction";

interface FiltersBarProps { fields: FilterField[]; yearOptions: string[]; }

export const FiltersBar = ({ fields, yearOptions }: FiltersBarProps) => {
  const shows = (field: FilterField) => fields.includes(field);

  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
      {shows("year") && <YearFilter options={yearOptions} />}
      {shows("currency") && <CurrencyFilter />}
      {shows("card") && <CardFilter />}
      {shows("month") && <MonthFilter />}
      {shows("transaction") && <TransactionFilters />}
    </Box>
  );
};
