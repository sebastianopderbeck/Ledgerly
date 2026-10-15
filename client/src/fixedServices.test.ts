import { describe, it, expect } from "vitest";
import type { FixedServiceDTO } from "@ledgerly/shared";
import {
  fixedServiceDraftFrom, fixedServiceRequest, fixedServiceSections, monthlyEquivalent, monthlyTotal,
  serviceMonth, type FixedServiceDraft,
} from "./fixedServices.js";

const MES = "2026-10";

const servicio = (overrides: Partial<FixedServiceDTO> = {}): FixedServiceDTO => ({
  id: "f-luz", nombre: "Luz", monto: 30_000, cadencia: "mensual", desde: "2026-09", hasta: null, montoDesde: "2026-09",
  ...overrides,
});

const draft = (overrides: Partial<FixedServiceDraft> = {}): FixedServiceDraft => ({
  nombre: "Internet", monto: "25.000", cadencia: "mensual", desde: MES, hasta: "", ...overrides,
});

describe("monthlyEquivalent y monthlyTotal", () => {
  it("un bimestral cuenta la mitad por mes", () => {
    expect(monthlyEquivalent({ monto: 18_000, cadencia: "bimestral" })).toBe(9_000);
    expect(monthlyTotal([servicio(), servicio({ id: "f-gas", monto: 18_000, cadencia: "bimestral" })])).toBe(39_000);
  });
});

describe("fixedServiceSections", () => {
  it("separa activos y dados de baja", () => {
    const cable = servicio({ id: "f-cable", nombre: "Cable", hasta: "2026-08" });
    expect(fixedServiceSections([servicio(), cable], MES)).toEqual({ activos: [servicio()], deBaja: [cable] });
  });
});

describe("serviceMonth", () => {
  it("los activos muestran desde y los dados de baja, hasta", () => {
    expect(serviceMonth("activos", servicio({ hasta: "2026-12" }))).toBe("2026-09");
    expect(serviceMonth("deBaja", servicio({ hasta: "2026-08" }))).toBe("2026-08");
  });
});

describe("fixedServiceDraftFrom", () => {
  it("un servicio nuevo arranca vacío, mensual y desde el mes actual", () => {
    expect(fixedServiceDraftFrom(null, MES)).toEqual({ nombre: "", monto: "", cadencia: "mensual", desde: MES, hasta: "" });
  });

  it("uno existente trae el monto en formato argentino", () => {
    expect(fixedServiceDraftFrom(servicio({ hasta: "2026-12" }), MES))
      .toEqual({ nombre: "Luz", monto: "30.000", cadencia: "mensual", desde: "2026-09", hasta: "2026-12" });
  });
});

describe("fixedServiceRequest", () => {
  it("arma el alta con el monto tipeado", () => {
    expect(fixedServiceRequest(draft({ cadencia: "bimestral", desde: "2026-11" }), null)).toEqual({
      kind: "create", body: { nombre: "Internet", monto: 25_000, cadencia: "bimestral", desde: "2026-11" },
    });
  });

  it("entiende decimales en formato argentino", () => {
    expect(fixedServiceRequest(draft({ monto: "12.345,50" }), null)).toMatchObject({ body: { monto: 12_345.5 } });
  });

  it("redondea el monto a centavos", () => {
    expect(fixedServiceRequest(draft({ monto: "1.234,567" }), null)).toMatchObject({ body: { monto: 1_234.57 } });
  });

  it("editar solo el nombre de un monto con más de dos decimales no manda el monto", () => {
    const viejo = servicio({ monto: 1_234.567 });
    expect(fixedServiceRequest({ ...fixedServiceDraftFrom(viejo, MES), nombre: "Electricidad" }, viejo))
      .toEqual({ kind: "update", id: "f-luz", body: { nombre: "Electricidad" } });
  });

  it.each([
    ["sin nombre", { nombre: "  " }],
    ["sin monto", { monto: "" }],
    ["con monto 0", { monto: "0" }],
    ["con un mes inválido", { desde: "2026-13" }],
    ["con hasta antes de desde", { desde: "2026-11", hasta: "2026-10" }],
  ])("no arma nada %s", (_label, overrides) => {
    expect(fixedServiceRequest(draft(overrides), null)).toBeNull();
  });

  it("al editar manda solo lo que cambió", () => {
    const luz = servicio();
    expect(fixedServiceRequest(fixedServiceDraftFrom(luz, MES), luz)).toBeNull();
    expect(fixedServiceRequest({ ...fixedServiceDraftFrom(luz, MES), monto: "36.000" }, luz))
      .toEqual({ kind: "update", id: "f-luz", body: { monto: 36_000 } });
    expect(fixedServiceRequest({ ...fixedServiceDraftFrom(luz, MES), hasta: "2026-10" }, luz))
      .toEqual({ kind: "update", id: "f-luz", body: { hasta: "2026-10" } });
  });

  it("vaciar hasta reactiva el servicio", () => {
    const cable = servicio({ hasta: "2026-08" });
    expect(fixedServiceRequest({ ...fixedServiceDraftFrom(cable, MES), hasta: "" }, cable))
      .toEqual({ kind: "update", id: "f-luz", body: { hasta: null } });
  });
});
