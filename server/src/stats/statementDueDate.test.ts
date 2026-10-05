import { describe, it, expect } from "vitest";
import { DIAS_CIERRE_A_VENCIMIENTO, statementDueDate } from "./statementDueDate.js";

describe("statementDueDate", () => {
  it("usa el vencimiento del resumen cuando lo trae", () => {
    expect(statementDueDate({ dueDate: "2026-10-13", closingDate: "2026-10-02" })).toBe("2026-10-13");
  });

  it("sin vencimiento lo estima a 12 días del cierre, cruzando el mes", () => {
    expect(DIAS_CIERRE_A_VENCIMIENTO).toBe(12);
    expect(statementDueDate({ dueDate: null, closingDate: "2026-08-27" })).toBe("2026-09-08");
    expect(statementDueDate({ dueDate: null, closingDate: "2026-09-25" })).toBe("2026-10-07");
  });

  it("sin ninguna de las dos fechas devuelve null", () => {
    expect(statementDueDate({ dueDate: null, closingDate: null })).toBeNull();
  });
});
