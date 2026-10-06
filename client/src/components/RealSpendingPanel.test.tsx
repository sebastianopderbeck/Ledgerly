import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { FutureInstallmentMonth, InflationRateDTO, MonthlyStat, StatementDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { flushAsync } from "../testing/flushAsync.js";
import { cssFor } from "../testing/cssFor.js";
import { addMonths } from "../isoDate.js";
import { RealSpendingPanel } from "./RealSpendingPanel.js";
import { RealSpendingStats } from "./RealSpendingStats.js";

const monthsFrom = (desde: string, hasta: string): string[] => {
  const months: string[] = [];
  for (let month = desde; month <= hasta; month = addMonths(month, 1)) months.push(month);
  return months;
};

const statement = (closingDate: string): StatementDTO => ({
  id: `icbc-${closingDate}`, issuer: "icbc", cardLabel: "ICBC", last4: "1234",
  closingDate, dueDate: null,
  totals: {
    totalConsumos: { ars: 0, usd: 0 },
    saldoActual: { ars: 0, usd: 0 },
    pagoMinimo: { ars: 0, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: "i.pdf", needsReview: false, reconciliation: { ok: true, entries: [] },
  transactionCount: 0, uploadedAt: "2026-07-01T00:00:00.000Z",
});

const totalOf = (month: string): number => {
  if (month === "2025-07") return 100000;
  if (month === "2026-07") return 150000;
  return 120000;
};

const MONTHLY: MonthlyStat[] = monthsFrom("2025-01", "2026-08").map((month) => ({ month, total: totalOf(month), count: 3 }));
const STATEMENTS: StatementDTO[] = monthsFrom("2025-01", "2026-08").map((month) => statement(`${month}-07`));
const INFLATION: InflationRateDTO[] = monthsFrom("2025-01", "2026-07").map((periodo) => ({ periodo, variacionMensual: 0 }));
const PENDING: FutureInstallmentMonth[] = [{
  month: "2026-09", total: 30000, count: 1,
  items: [{ merchant: "COMERCIO", category: "Compras", amount: 30000, installmentNumber: 2, installmentTotal: 3, purchaseDate: "2026-07-15" }],
}];

interface Fixture {
  statements: StatementDTO[];
  inflation: InflationRateDTO[] | null;
}

let fixture: Fixture = { statements: STATEMENTS, inflation: INFLATION };

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const route = (url: string): Response => {
  if (url.includes("/inflation")) return fixture.inflation === null ? respond({ error: "caído" }, 500) : respond(fixture.inflation);
  if (url.includes("/statements")) return respond(fixture.statements);
  if (url.includes("/stats/future-installments/detail")) return respond(PENDING);
  if (url.includes("/stats/monthly")) return respond(MONTHLY);
  return respond({});
};

beforeEach(() => {
  fixture = { statements: STATEMENTS, inflation: INFLATION };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => route(url)));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const calledUrls = () => vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
const urlOf = (path: string) => calledUrls().find((url) => url.includes(path));

describe("RealSpendingPanel", () => {
  it("con datos muestra los pesos de referencia y las dos lecturas con signo", async () => {
    renderWithProviders(<RealSpendingPanel currency="ARS" year={["2026"]} />);
    expect(await screen.findByText(
      "En pesos de julio de 2026 (último IPC publicado). Incluye las cuotas que faltan facturar.",
    )).toBeInTheDocument();
    expect(screen.getByText("Interanual")).toBeInTheDocument();
    expect(screen.getByText("+80,0%")).toBeInTheDocument();
    expect(screen.getByText("vs julio de 2025")).toBeInTheDocument();
    expect(screen.getByText("Vs promedio")).toBeInTheDocument();
    expect(screen.getByText("+52,1%")).toBeInTheDocument();
    expect(screen.getByText("de los 12 meses anteriores")).toBeInTheDocument();
  });

  it("pide la historia completa en pesos, sin año ni mes", async () => {
    renderWithProviders(<RealSpendingPanel currency="ARS" year={["2026"]} from="2026-07-01" to="2026-07-31" />);
    await waitFor(() => expect(urlOf("/stats/future-installments/detail")).toBeDefined());
    await waitFor(() => expect(urlOf("/stats/monthly")).toBeDefined());
    for (const url of [urlOf("/stats/future-installments/detail")!, urlOf("/stats/monthly")!]) {
      expect(url).toContain("currency=ARS");
      expect(url).not.toContain("year=");
      expect(url).not.toContain("from=");
    }
  });

  it("en dólares avisa y no pide datos", async () => {
    renderWithProviders(<RealSpendingPanel currency="USD" year={["2026"]} />);
    expect(screen.getByText("El gasto real se calcula sobre los consumos en pesos.")).toBeInTheDocument();
    await flushAsync();
    expect(urlOf("/inflation")).toBeUndefined();
    expect(urlOf("/stats/future-installments/detail")).toBeUndefined();
  });

  it("sin IPC cargado dice que no hay datos de inflación", async () => {
    fixture = { ...fixture, inflation: [] };
    renderWithProviders(<RealSpendingPanel currency="ARS" year={["2026"]} />);
    expect(await screen.findByText("Sin datos de inflación")).toBeInTheDocument();
  });

  it("con un solo resumen no hay meses cerrados", async () => {
    fixture = { ...fixture, statements: [statement("2026-08-07")] };
    renderWithProviders(<RealSpendingPanel currency="ARS" year={["2026"]} />);
    expect(await screen.findByText("Sin meses cerrados con IPC publicado en este período")).toBeInTheDocument();
  });

  it("si falla una llamada avisa en vez de mostrar un gráfico vacío", async () => {
    fixture = { ...fixture, inflation: null };
    renderWithProviders(<RealSpendingPanel currency="ARS" year={["2026"]} />);
    expect(await screen.findByText("No se pudo calcular el gasto real")).toBeInTheDocument();
  });
});

describe("RealSpendingStats", () => {
  it("muestra el gasto real del mes de referencia", () => {
    renderWithProviders(
      <RealSpendingStats summary={{ month: "2026-07", real: 150000, interanual: 4.2, vsPromedio: -3.1, mesesPromedio: 12 }} />,
    );
    expect(screen.getByText((text) => text.startsWith("Julio de 2026:") && text.includes("150.000"))).toBeInTheDocument();
  });

  it("pinta la suba como advertencia y la baja como favorable", () => {
    renderWithProviders(
      <RealSpendingStats summary={{ month: "2026-07", real: 150000, interanual: 4.2, vsPromedio: -3.1, mesesPromedio: 12 }} />,
    );
    expect(cssFor(screen.getByText("+4,2%"))).toContain("#fbbf24");
    expect(cssFor(screen.getByText("−3,1%"))).toContain("#22c55e");
  });

  it("sin datos muestra guiones y explica qué falta", () => {
    renderWithProviders(
      <RealSpendingStats summary={{ month: "2026-07", real: 150000, interanual: null, vsPromedio: null, mesesPromedio: 2 }} />,
    );
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("sin datos de julio de 2025")).toBeInTheDocument();
    expect(screen.getByText("faltan meses anteriores")).toBeInTheDocument();
  });
});
