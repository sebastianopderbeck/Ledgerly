import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useInstallmentYearOptions, useTransactionYearOptions } from "./useYearOptions.js";

const renderWithClient = <T,>(hook: () => T) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(hook, { wrapper });
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/stats/future-installments") ? [{ month: "2026-12", total: 1 }, { month: "2027-01", total: 1 }]
      : url.includes("/stats/monthly") ? [{ month: "2024-03", total: 1, count: 1 }, { month: "2026-05", total: 1, count: 1 }]
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("opciones de año", () => {
  it("useTransactionYearOptions lista los años con consumos", async () => {
    const { result } = renderWithClient(() => useTransactionYearOptions("ARS", undefined));
    await waitFor(() => expect(result.current).toEqual(["2024", "2026"]));
  });

  it("useInstallmentYearOptions lista los años de vencimiento", async () => {
    const { result } = renderWithClient(() => useInstallmentYearOptions("ARS", undefined));
    await waitFor(() => expect(result.current).toEqual(["2026", "2027"]));
  });
});
