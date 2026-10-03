import { describe, it, expect } from "vitest";
import { installmentLabel } from "./transactionInstallment.js";

describe("installmentLabel", () => {
  it("un movimiento que no es cuota no lleva etiqueta", () => {
    expect(installmentLabel({ isInstallment: false, installmentCurrent: null, installmentTotal: null })).toBeNull();
  });

  it("una cuota con número y total se muestra como N/M", () => {
    expect(installmentLabel({ isInstallment: true, installmentCurrent: 3, installmentTotal: 12 })).toBe("3/12");
  });

  it("una cuota sin número se muestra como «cuota»", () => {
    expect(installmentLabel({ isInstallment: true, installmentCurrent: null, installmentTotal: null })).toBe("cuota");
  });
});
