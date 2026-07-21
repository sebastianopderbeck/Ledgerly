import { useByCategoryLastStatement, type StatFilters } from "../../api/hooks.js";
import { CategoryPie } from "./CategoryPie.js";

export const LastStatementCategoryChart = (filters: StatFilters) => {
  const { data } = useByCategoryLastStatement(filters);
  return <CategoryPie data={data} currency={filters.currency} />;
};
