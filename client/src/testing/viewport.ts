import { vi } from "vitest";
import { act } from "@testing-library/react";

type Listener = () => void;

const MOBILE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;

let currentWidth = DESKTOP_WIDTH;
const listeners = new Set<Listener>();

const matchesWidth = (query: string, width: number): boolean => {
  const min = /min-width:\s*([\d.]+)px/.exec(query);
  const max = /max-width:\s*([\d.]+)px/.exec(query);
  if (!min && !max) return false;
  if (min && width < Number(min[1])) return false;
  if (max && width > Number(max[1])) return false;
  return true;
};

const mediaQueryList = (query: string) => ({
  get matches() {
    return matchesWidth(query, currentWidth);
  },
  media: query,
  onchange: null,
  addEventListener: (_type: string, listener: Listener) => {
    listeners.add(listener);
  },
  removeEventListener: (_type: string, listener: Listener) => {
    listeners.delete(listener);
  },
  addListener: (listener: Listener) => {
    listeners.add(listener);
  },
  removeListener: (listener: Listener) => {
    listeners.delete(listener);
  },
  dispatchEvent: () => false,
});

const emulateWidth = (width: number): void => {
  currentWidth = width;
  vi.stubGlobal("matchMedia", mediaQueryList);
  act(() => {
    for (const listener of [...listeners]) listener();
  });
};

export const emulateMobile = (): void => emulateWidth(MOBILE_WIDTH);

export const emulateDesktop = (): void => emulateWidth(DESKTOP_WIDTH);
