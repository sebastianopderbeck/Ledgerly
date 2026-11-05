import type { TransactionDTO } from "@ledgerly/shared";
import { canMarkAsSubscription } from "./subscriptions.js";

export const canMarkAsService = (transaction: TransactionDTO): boolean =>
  canMarkAsSubscription(transaction) && transaction.currency === "ARS";
