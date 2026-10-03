import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const readStored = <T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const writeStored = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
};

export function useStoredState<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(() => readStored(key, fallback, isValid));

  useEffect(() => {
    writeStored(key, value);
  }, [key, value]);

  return [value, setValue];
}
