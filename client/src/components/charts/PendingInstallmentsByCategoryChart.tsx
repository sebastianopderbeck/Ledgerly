import { useFutureInstallmentsDetail, type StatFilters } from "../../api/hooks.js";
import { CategoryPie } from "./CategoryPie.js";
import { pendingInstallmentsByCategory } from "./pendingInstallmentsByCategory.js";

export const PendingInstallmentsByCategoryChart = (filters: StatFilters) => {
  const { data } = useFutureInstallmentsDetail(filters);
  return <CategoryPie data={data ? pendingInstallmentsByCategory(data) : undefined} currency={filters.currency} />;
};
