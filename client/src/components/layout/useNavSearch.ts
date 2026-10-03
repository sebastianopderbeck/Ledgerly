import { useSearchParams } from "react-router-dom";
import { globalSearch } from "../../filters/globalFilters.js";

export function useNavSearch(): string {
  const [params] = useSearchParams();
  return globalSearch(params);
}
