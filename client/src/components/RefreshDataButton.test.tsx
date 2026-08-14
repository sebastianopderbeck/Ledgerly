import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { RefreshDataButton } from "./RefreshDataButton.js";

const summary = {
  series: { usdOficial: 232, uva: 232, tasa30: 221, inflacion: 19 },
  tipoCambio: {
    cupones: { updated: 12, skipped: 0 },
    auto: { updated: 8, skipped: 0 },
    sueldos: { updated: 6, skipped: 0 },
  },
};

const calls: { url: string; method?: string }[] = [];
let settle: (response: Response) => void = () => {};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method });
    return new Promise<Response>((resolve) => { settle = resolve; });
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RefreshDataButton", () => {
  it("pide la actualización al servidor cuando se hace click", async () => {
    renderWithProviders(<RefreshDataButton />);

    fireEvent.click(screen.getByLabelText("actualizar datos"));

    await waitFor(() => expect(calls).toEqual([{ url: "/api/macro/refresh", method: "POST" }]));
  });

  it("no dispara nada hasta que el usuario hace click", () => {
    renderWithProviders(<RefreshDataButton />);

    expect(calls).toEqual([]);
  });

  it("deshabilita el botón mientras la actualización está en curso", async () => {
    renderWithProviders(<RefreshDataButton />);

    fireEvent.click(screen.getByLabelText("actualizar datos"));

    await waitFor(() => expect(screen.getByLabelText("actualizar datos")).toBeDisabled());
    settle(jsonResponse(summary));
    await waitFor(() => expect(screen.getByLabelText("actualizar datos")).toBeEnabled());
  });

  it("muestra el resumen de lo actualizado al terminar", async () => {
    renderWithProviders(<RefreshDataButton />);

    fireEvent.click(screen.getByLabelText("actualizar datos"));
    await waitFor(() => expect(calls).toHaveLength(1));
    settle(jsonResponse(summary));

    await waitFor(() => expect(
      screen.getByText("Datos actualizados · 704 puntos de series · 26 tipos de cambio"),
    ).toBeInTheDocument());
  });

  it("muestra el error cuando la actualización falla", async () => {
    renderWithProviders(<RefreshDataButton />);

    fireEvent.click(screen.getByLabelText("actualizar datos"));
    await waitFor(() => expect(calls).toHaveLength(1));
    settle(jsonResponse({ error: "argentinadatos no responde" }, 502));

    await waitFor(() => expect(screen.getByText("argentinadatos no responde")).toBeInTheDocument());
  });
});
