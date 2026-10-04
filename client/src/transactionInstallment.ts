import type { TransactionDTO } from "@ledgerly/shared";

type InstallmentFields = Pick<TransactionDTO, "isInstallment" | "installmentCurrent" | "installmentTotal">;

export const installmentLabel = ({ isInstallment, installmentCurrent, installmentTotal }: InstallmentFields): string | null => {
  if (!isInstallment) return null;
  return installmentCurrent && installmentTotal ? `${installmentCurrent}/${installmentTotal}` : "cuota";
};
