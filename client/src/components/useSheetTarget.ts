import { useCallback, useState } from "react";

export interface SheetTarget<T> {
  target: T | null;
  open: boolean;
  show: (target: T) => void;
  close: () => void;
}

export function useSheetTarget<T>(): SheetTarget<T> {
  const [target, setTarget] = useState<T | null>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback((next: T) => {
    setTarget(next);
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return { target, open, show, close };
}
