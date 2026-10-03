import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImportedFileDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { ImportedFilesSection } from "./ImportedFilesSection.js";

const files: ImportedFileDTO[] = [
  { id: "s1", kind: "statement", fileName: "visa-julio.pdf", uploadedAt: "2026-07-05T12:00:00.000Z",
    documentDate: "2026-07-02", description: "Visa ****1234 · 3 movimientos", needsReview: true },
  { id: "p1", kind: "payslip", fileName: "recibo-junio.pdf", uploadedAt: "2026-07-04T12:00:00.000Z",
    documentDate: "2026-06-30", description: "Período 2026-06", needsReview: false },
  { id: "c1", kind: "coupon", fileName: "cupon-1.pdf", uploadedAt: "2026-07-01T12:00:00.000Z",
    documentDate: "2025-08-18", description: "Préstamo 0405 · cuota 1", needsReview: false },
];

const calls: { url: string; method: string }[] = [];

const respond = (body: unknown, status = 200) =>
  status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubApi = (list: () => Response) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    return method === "DELETE" ? respond(null, 204) : list();
  }));
};

beforeEach(() => {
  calls.length = 0;
  stubApi(() => respond(files));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const visibleFiles = () => ["visa-julio.pdf", "recibo-junio.pdf", "cupon-1.pdf"].filter((name) => screen.queryByText(name));

const pickOption = async (label: RegExp, option: string) => {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(within(await screen.findByRole("listbox")).getByRole("option", { name: option }));
  await userEvent.keyboard("{Escape}");
};

describe("ImportedFilesSection", () => {
  it("muestra todos los archivos importados", async () => {
    renderWithProviders(<ImportedFilesSection />);
    expect(await screen.findByText("visa-julio.pdf")).toBeInTheDocument();
    expect(visibleFiles()).toEqual(["visa-julio.pdf", "recibo-junio.pdf", "cupon-1.pdf"]);
  });

  it("filtra por tipo", async () => {
    renderWithProviders(<ImportedFilesSection />);
    await screen.findByText("visa-julio.pdf");
    await pickOption(/tipo/i, "Sueldo");
    expect(visibleFiles()).toEqual(["recibo-junio.pdf"]);
  });

  it("filtra por año del documento", async () => {
    renderWithProviders(<ImportedFilesSection />);
    await screen.findByText("visa-julio.pdf");
    await pickOption(/año/i, "2025");
    expect(visibleFiles()).toEqual(["cupon-1.pdf"]);
  });

  it("busca por nombre de archivo o detalle", async () => {
    renderWithProviders(<ImportedFilesSection />);
    await screen.findByText("visa-julio.pdf");
    await userEvent.type(screen.getByRole("textbox", { name: /buscar/i }), "prestamo");
    expect(visibleFiles()).toEqual(["cupon-1.pdf"]);
  });

  it("muestra solo los que hay que revisar", async () => {
    renderWithProviders(<ImportedFilesSection />);
    await screen.findByText("visa-julio.pdf");
    await userEvent.click(screen.getByRole("checkbox", { name: /solo a revisar/i }));
    expect(visibleFiles()).toEqual(["visa-julio.pdf"]);
  });

  it("borra un archivo según su tipo", async () => {
    renderWithProviders(<ImportedFilesSection />);
    await userEvent.click(await screen.findByRole("button", { name: "borrar cupon-1.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(calls).toContainEqual({ url: "/api/imports/coupon/c1", method: "DELETE" }));
  });

  it("sin archivos avisa que todavía no se importó nada", async () => {
    stubApi(() => respond([]));
    renderWithProviders(<ImportedFilesSection />);
    expect(await screen.findByText(/todavía no importaste archivos/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /tipo/i })).not.toBeInTheDocument();
  });

  it("si falla la carga muestra el error", async () => {
    stubApi(() => respond({ error: "Mongo caído" }, 500));
    renderWithProviders(<ImportedFilesSection />);
    expect(await screen.findByText("Mongo caído")).toBeInTheDocument();
  });
});
