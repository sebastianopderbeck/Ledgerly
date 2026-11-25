import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
import {
  ajusteAnioAnteriorTexto,
  avisoRetencionTexto,
  type AvisoRetencion,
  type MesRetencion,
  type ResultadoRetencion,
} from "../gananciasRetencion.js";
import { GananciasRetentionSection } from "./GananciasRetentionSection.js";

const mes = (overrides: Partial<MesRetencion>): MesRetencion => ({
  mes: 1, recibos: ["Dic 2025"], gananciaNetaSujeta: 10000, esperado: 1000, retenido: 1000,
  diferencia: 0, veredicto: "coincide", cambioDeTablas: false, ...overrides,
});

const DOS_MESES: MesRetencion[] = [
  mes({ mes: 1, cambioDeTablas: true }),
  mes({ mes: 2, recibos: ["Ene 2026"], esperado: 2000, retenido: 2500, diferencia: 500, veredicto: "de_mas" }),
];

const calculado = (overrides: Partial<Extract<ResultadoRetencion, { estado: "calculado" }>> = {}): ResultadoRetencion => ({
  estado: "calculado", anio: 2026, meses: DOS_MESES, avisos: [], ajusteAnioAnterior: null, ...overrides,
});

const comoSeVe = (texto: string): string => texto.replace(/\s+/g, " ");

const expandir = () => userEvent.click(screen.getByRole("button", { name: /Retención de Ganancias 2026/ }));

afterEach(() => {
  cleanup();
});

describe("GananciasRetentionSection", () => {
  it("sin recibos no muestra nada", () => {
    renderWithProviders(<GananciasRetentionSection resultado={{ estado: "sin_recibos" }} />);
    expect(screen.queryByText(/Retención de Ganancias/)).not.toBeInTheDocument();
  });

  it("sin tablas avisa", () => {
    renderWithProviders(<GananciasRetentionSection resultado={{ estado: "sin_tablas", anio: 2027 }} />);
    expect(screen.getByText("Faltan las tablas de ARCA de 2027")).toBeInTheDocument();
  });

  it("muestra el veredicto del último mes sin expandir", () => {
    renderWithProviders(<GananciasRetentionSection resultado={calculado()} />);
    expect(screen.getByText("Retención de Ganancias 2026")).toBeInTheDocument();
    expect(screen.getByText("Te retienen de más")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("al expandir muestra la tabla con el cambio de tablas en enero", async () => {
    renderWithProviders(<GananciasRetentionSection resultado={calculado()} />);
    await expandir();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("Cambio de tablas")).toBeInTheDocument();
    expect(within(table).getByText("Enero de 2026")).toBeInTheDocument();
    expect(screen.getByText("Impuesto esperado acum.")).toBeInTheDocument();
  });

  it("muestra avisos y el ajuste del año anterior", async () => {
    const aviso: AvisoRetencion = { tipo: "falta_recibo", periodo: "2026-02", sac: false, hastaMes: 2 };
    const ajuste = { anio: 2025, monto: -3000 };
    renderWithProviders(<GananciasRetentionSection resultado={calculado({ avisos: [aviso], ajusteAnioAnterior: ajuste })} />);
    await expandir();
    expect(screen.getByText(avisoRetencionTexto(aviso, 2026))).toBeInTheDocument();
    expect(screen.getByText(comoSeVe(ajusteAnioAnteriorTexto(ajuste, 2026)))).toBeInTheDocument();
  });

  it("sin meses calculables muestra solo el aviso", async () => {
    const aviso: AvisoRetencion = { tipo: "falta_recibo", periodo: "2025-12", sac: false, hastaMes: 0 };
    renderWithProviders(<GananciasRetentionSection resultado={calculado({ meses: [], avisos: [aviso] })} />);
    await expandir();
    expect(screen.getByText(avisoRetencionTexto(aviso, 2026))).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Impuesto esperado acum.")).not.toBeInTheDocument();
  });

  describe("mobile", () => {
    beforeEach(() => emulateMobile());
    afterEach(() => emulateDesktop());

    it("muestra tarjetas y el veredicto", async () => {
      renderWithProviders(<GananciasRetentionSection resultado={calculado()} />);
      expect(screen.getByText("Te retienen de más")).toBeInTheDocument();
      await expandir();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.getByRole("article", { name: "Enero de 2026" })).toBeInTheDocument();
      expect(screen.getByRole("article", { name: "Febrero de 2026" })).toBeInTheDocument();
    });
  });
});
