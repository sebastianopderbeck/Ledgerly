import type { FilterField } from "../../filters/activeFilters.js";
import { YearFilter } from "./YearFilter.js";
import { CurrencyFilter } from "./CurrencyFilter.js";
import { CardFilter } from "./CardFilter.js";
import { MonthFilter } from "./MonthFilter.js";
import { TransactionFilters } from "./TransactionFilters.js";

interface FilterFieldsProps {
  fields: FilterField[];
  yearOptions: string[];
  withSearch?: boolean;
}

export const FilterFields = ({ fields, yearOptions, withSearch = true }: FilterFieldsProps) => {
  const shows = (field: FilterField) => fields.includes(field);

  return (
    <>
      {shows("year") && <YearFilter options={yearOptions} />}
      {shows("currency") && <CurrencyFilter />}
      {shows("card") && <CardFilter />}
      {shows("month") && <MonthFilter />}
      {shows("transaction") && <TransactionFilters withSearch={withSearch} />}
    </>
  );
};
