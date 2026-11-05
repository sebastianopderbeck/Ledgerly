import type { CardServiceDTO, TransactionDTO } from "@ledgerly/shared";
import { canMarkAsSubscription } from "./subscriptions.js";

export const canMarkAsService = (transaction: TransactionDTO): boolean =>
  canMarkAsSubscription(transaction) && transaction.currency === "ARS";

export interface CardServiceListProps {
  items: CardServiceDTO[];
  onRemove: (item: CardServiceDTO) => void;
}

export const CARD_SERVICES_LABEL = "Servicios en la tarjeta";

export const removeCardServiceMessage = (item: CardServiceDTO | null): string =>
  (item ? `¿Sacar «${item.nombre}» de Servicios? Sus cargos vuelven a contar en Tarjetas.` : "");
