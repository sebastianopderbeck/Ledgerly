import { useEffect } from "react";

export function useThemeColorMeta(color: string): void {
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  }, [color]);
}
