import { useByCategory, type StatFilters } from "../../api/hooks.js";
import { CategoryPie } from "./CategoryPie.js";

export const CategoryBreakdownChart = (filters: StatFilters) => {
  const { data } = useByCategory(filters);
  return <CategoryPie data={data} currency={filters.currency} />;
};
