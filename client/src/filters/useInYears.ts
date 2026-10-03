import type { AutoCouponDTO, MortgageCouponDTO } from "@ledgerly/shared";
import { useAutoCoupons, useCreditCoupons } from "../api/hooks.js";
import { filterInYears } from "./globalFilters.js";
import { useGlobalFilters } from "./useGlobalFilters.js";

interface InYearsResult<T> { data: T[] | undefined; isLoading: boolean; }

const debitDate = (coupon: MortgageCouponDTO): string => coupon.fechaDebito;
const dueDate = (coupon: AutoCouponDTO): string => coupon.fechaVencimiento;

export const useCreditCouponsInYears = (): InYearsResult<MortgageCouponDTO> => {
  const { yearSelection } = useGlobalFilters();
  const { data, isLoading } = useCreditCoupons();
  return { data: filterInYears(data, debitDate, yearSelection), isLoading };
};

export const useAutoCouponsInYears = (): InYearsResult<AutoCouponDTO> => {
  const { yearSelection } = useGlobalFilters();
  const { data, isLoading } = useAutoCoupons();
  return { data: filterInYears(data, dueDate, yearSelection), isLoading };
};
