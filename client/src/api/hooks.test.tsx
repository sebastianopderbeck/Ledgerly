import { describe, it, expect, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StatementReviewDTO } from "@ledgerly/shared";
import {
  statementReviewKey,
  useBudgetSpending,
  useMarkFindingsReviewed,
  useMarkSubscription,
  useNetWorth,
  useSetSubscriptionCadence,
  useSetSubscriptionHidden,
  useStatementReview,
} from "./hooks.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const wrapperFor = (client: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const respond = (status: number, body?: unknown) =>
  vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  }));

const calledUrls = () => vi.mocked(fetch).mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url)}`);

describe("hooks de las features nuevas", () => {
  it("useNetWorth con 204 deja data en null sin marcar error", async () => {
    vi.stubGlobal("fetch", respond(204));
    const { result } = renderHook(() => useNetWorth(), { wrapper: wrapperFor(newClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("useSetSubscriptionHidden codifica la clave y usa PUT para ocultar y DELETE para mostrar", async () => {
    vi.stubGlobal("fetch", respond(204));
    const { result } = renderHook(() => useSetSubscriptionHidden(), { wrapper: wrapperFor(newClient()) });
    await act(() => result.current.mutateAsync({ key: "STREAMFLIX COM", hidden: true }));
    await act(() => result.current.mutateAsync({ key: "STREAMFLIX COM", hidden: false }));
    expect(calledUrls()).toEqual([
      "PUT /api/subscriptions/hidden/STREAMFLIX%20COM",
      "DELETE /api/subscriptions/hidden/STREAMFLIX%20COM",
    ]);
  });

  it("useSetSubscriptionCadence codifica la clave, manda la cadencia por PUT e invalida las suscripciones", async () => {
    vi.stubGlobal("fetch", respond(204));
    const client = newClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSetSubscriptionCadence(), { wrapper: wrapperFor(client) });
    await act(() => result.current.mutateAsync({ key: "STREAMBOX PLUS", cadencia: "bimestral" }));
    expect(calledUrls()).toEqual(["PUT /api/subscriptions/cadence/STREAMBOX%20PLUS"]);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({ cadencia: "bimestral" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["subscriptions"] });
  });

  it("useMarkSubscription manda el movimiento por POST e invalida las suscripciones", async () => {
    vi.stubGlobal("fetch", respond(204));
    const client = newClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useMarkSubscription(), { wrapper: wrapperFor(client) });
    await act(() => result.current.mutateAsync("tx-4"));
    expect(calledUrls()).toEqual(["POST /api/subscriptions/manual"]);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({ transactionId: "tx-4" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["subscriptions"] });
  });

  it("useBudgetSpending manda los años como parámetros repetidos", async () => {
    vi.stubGlobal("fetch", respond(200, { ultimoMesCerrado: null, gastos: [] }));
    const { result } = renderHook(() => useBudgetSpending(["2025", "2026"]), { wrapper: wrapperFor(newClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calledUrls()).toEqual(["GET /api/budgets/spending?year=2025&year=2026"]);
  });

  it("useStatementReview no pide nada sin resumen elegido", () => {
    vi.stubGlobal("fetch", respond(200, {}));
    const { result } = renderHook(() => useStatementReview(null), { wrapper: wrapperFor(newClient()) });
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("useMarkFindingsReviewed tilda en la caché antes de que responda el server", async () => {
    const client = newClient();
    const review = { reviewedKeys: ["tx:a"] } as StatementReviewDTO;
    client.setQueryData(statementReviewKey("s1"), review);
    let release: () => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response(JSON.stringify({ reviewedKeys: ["tx:a", "tx:b"] }), { status: 200 }));
    })));
    const { result } = renderHook(() => useMarkFindingsReviewed(), { wrapper: wrapperFor(client) });

    act(() => result.current.mutate({ statementId: "s1", keys: ["tx:b"], reviewed: true }));

    await waitFor(() =>
      expect(client.getQueryData<StatementReviewDTO>(statementReviewKey("s1"))?.reviewedKeys).toEqual(["tx:a", "tx:b"]));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("/api/statements/s1/review");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ keys: ["tx:b"], reviewed: true });
    release();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
