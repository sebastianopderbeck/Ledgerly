import { useCallback } from "react";
import { useStoredState } from "../../useStoredState.js";

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

interface SidebarCollapsedState {
  collapsed: boolean;
  toggleCollapsed: () => void;
}

export function useSidebarCollapsed(): SidebarCollapsedState {
  const [collapsed, setCollapsed] = useStoredState("ledgerly.sidebarCollapsed", false, isBoolean);
  const toggleCollapsed = useCallback(() => setCollapsed((current) => !current), [setCollapsed]);
  return { collapsed, toggleCollapsed };
}
