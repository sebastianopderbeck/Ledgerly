import { useCallback, useState } from "react";
import type { CardServiceDTO } from "@ledgerly/shared";
import { useUnmarkCardService } from "../api/hooks.js";

export interface CardServiceRemoval {
  pendingRemoval: CardServiceDTO | null;
  askRemove: (item: CardServiceDTO) => void;
  cancelRemove: () => void;
  confirmRemove: () => void;
}

export const useCardServiceRemoval = (): CardServiceRemoval => {
  const [pendingRemoval, setPendingRemoval] = useState<CardServiceDTO | null>(null);
  const { mutate: unmark } = useUnmarkCardService();

  const askRemove = useCallback((item: CardServiceDTO) => setPendingRemoval(item), []);
  const cancelRemove = useCallback(() => setPendingRemoval(null), []);
  const confirmRemove = useCallback(() => {
    if (pendingRemoval) unmark(pendingRemoval.key);
    setPendingRemoval(null);
  }, [pendingRemoval, unmark]);

  return { pendingRemoval, askRemove, cancelRemove, confirmRemove };
};
