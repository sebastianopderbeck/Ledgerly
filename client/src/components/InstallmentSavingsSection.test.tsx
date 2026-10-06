import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { InflationRateDTO, InstallmentPurchaseDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { InstallmentSavingsSection } from "./InstallmentSavingsSection.js";

vi.mock("@nivo/bar", async () => ({ ResponsiveBar: (await import("../testing/nivoProbe.js")).NivoProbe }));

const purchase: InstallmentPurchaseDTO = {
  id: "ICBC|2026-01-15|MERCADOLIBRE|3|1",
  cardLabel: "ICBC",
  merchant: "MERCADOLIBRE",
  category: "Compras",
  purchaseDate: "2026-01-15",
  installmentTotal: 3,
  installments: [
    { number: 1, amount: 1000, paymentDate: "2026-02-10" },
    { number: 2, amount: 1000, paymentDate: "2026-03-10" },
    { number: 3, amount: 1000, paymentDate: "2026-04-10" },
  ],
};

const inflation: InflationRateDTO[] = [
  { periodo: "2026-02", variacionMensual: 2 },
  { periodo: "2026-03", variacionMensual: 2 },
];

interface ApiFixture {
  purchases?: InstallmentPurchaseDTO[];
  rates?: InflationRateDTO[];
  failPurchases?: boolean;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubApi = ({ purchases = [purchase], rates = inflation, failPurchases = false }: ApiFixture = {}) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/stats/installment-purchases")) return failPurchases ? json({ error: "boom" }, 500) : json(purchases);
    if (url.includes("/inflation")) return json(rates);
    return json({});
  }));
};

const purchasesUrl = () =>
  vi.mocked(fetch).mock.calls.map((call) => String(call[0])).find((url) => url.includes("/stats/installment-purchases"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 2, 20, 12));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("InstallmentSavingsSection", () => {
  it("con compras e IPC muestra los tres KPIs, el chip de estimación y la nota con el último IPC", async () => {
    stubApi();
    renderWithProviders(<InstallmentSavingsSection years={["2026"]} />);
    expect(await screen.findByText("Ahorro real")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Cuánto te ahorran las cuotas" })).toBeInTheDocument();
    expect(screen.getByText("Estimación")).toBeInTheDocument();
    expect(screen.getByText("Compras en cuotas en pesos hechas en 2026")).toBeInTheDocument();
    expect(screen.getByText("3,9% menos que de contado")).toBeInTheDocument();
    expect(screen.getByText("En cuotas pagadas")).toBeInTheDocument();
    expect(screen.getByText("2 cuotas · con IPC publicado")).toBeInTheDocument();
    expect(screen.getByText("En cuotas a vencer")).toBeInTheDocument();
    expect(screen.getByText("1 cuota · supone 2,0% mensual")).toBeInTheDocument();
    expect(screen.getByText("Ahorro real por comercio")).toBeInTheDocument();
    expect(screen.getByText("Pagadas")).toBeInTheDocument();
    expect(screen.getByText("A vencer")).toBeInTheDocument();
    expect(screen.getByText(/después de marzo de 2026\) usa el último dato: 2,0% mensual\./)).toBeInTheDocument();
  });

  it("cuenta las cuotas pagadas con IPC estimado", async () => {
    stubApi({ rates: [{ periodo: "2026-02", variacionMensual: 2 }] });
    renderWithProviders(<InstallmentSavingsSection years={["2026"]} />);
    expect(await screen.findByText("2 cuotas · 1 con IPC estimado")).toBeInTheDocument();
  });

  it("con ahorro negativo dice cuánto más que de contado", async () => {
    stubApi({ rates: [{ periodo: "2026-02", variacionMensual: -1 }, { periodo: "2026-03", variacionMensual: -1 }] });
    renderWithProviders(<InstallmentSavingsSection years={["2026"]} />);
    expect(await screen.findByText("2,0% más que de contado")).toBeInTheDocument();
  });

  it("sin IPC explica cómo traerlo", async () => {
    stubApi({ rates: [] });
    renderWithProviders(<InstallmentSavingsSection years={["2026"]} />);
    expect(await screen.findByText(
      "Para estimar el ahorro hace falta la inflación. Usá el botón de actualizar de la barra superior para traerla.",
    )).toBeInTheDocument();
    expect(screen.getByText("Estimación")).toBeInTheDocument();
  });

  it("sin compras en los años elegidos lo dice con esos años", async () => {
    stubApi({ purchases: [] });
    renderWithProviders(<InstallmentSavingsSection years={["2025"]} />);
    expect(await screen.findByText("No hay compras en cuotas en pesos hechas en 2025")).toBeInTheDocument();
    expect(screen.getByText("Compras en cuotas en pesos hechas en 2025")).toBeInTheDocument();
  });

  it("con todos los años habla de todas las compras", async () => {
    stubApi({ purchases: [] });
    renderWithProviders(<InstallmentSavingsSection />);
    expect(await screen.findByText("No hay compras en cuotas en pesos")).toBeInTheDocument();
    expect(screen.getByText("Todas tus compras en cuotas en pesos")).toBeInTheDocument();
  });

  it("si falla el pedido de compras lo dice", async () => {
    stubApi({ failPurchases: true });
    renderWithProviders(<InstallmentSavingsSection years={["2026"]} />);
    expect(await screen.findByText("No se pudo calcular el ahorro de las cuotas.")).toBeInTheDocument();
  });

  it("pide las compras con la tarjeta y los años, sin moneda", async () => {
    stubApi();
    renderWithProviders(<InstallmentSavingsSection cardLabel="ICBC" years={["2025", "2026"]} />);
    await waitFor(() => expect(purchasesUrl()).toBeDefined());
    expect(purchasesUrl()).toContain("cardLabel=ICBC");
    expect(purchasesUrl()).toContain("year=2025&year=2026");
    expect(purchasesUrl()).not.toContain("currency");
  });
});
