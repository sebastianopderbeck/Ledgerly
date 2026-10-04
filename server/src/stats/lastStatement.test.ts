import { describe, it, expect } from "vitest";
import { latestStatementIdsPerIssuer, statementsBefore } from "./lastStatement.js";

const d = (s: string) => new Date(s);

describe("latestStatementIdsPerIssuer", () => {
  it("elige el resumen con closingDate más reciente por issuer", () => {
    const ids = latestStatementIdsPerIssuer([
      { id: "a", issuer: "icbc", closingDate: d("2026-05-02"), uploadedAt: d("2026-05-03") },
      { id: "b", issuer: "icbc", closingDate: d("2026-07-02"), uploadedAt: d("2026-07-03") },
      { id: "c", issuer: "visa_signature", closingDate: d("2026-06-02"), uploadedAt: d("2026-06-03") },
    ]);
    expect([...ids].sort()).toEqual(["b", "c"]);
  });

  it("desempata por uploadedAt cuando closingDate es nulo", () => {
    const ids = latestStatementIdsPerIssuer([
      { id: "old", issuer: "icbc", closingDate: null, uploadedAt: d("2026-05-01") },
      { id: "new", issuer: "icbc", closingDate: null, uploadedAt: d("2026-07-01") },
    ]);
    expect(ids).toEqual(["new"]);
  });

  it("prefiere un resumen con closingDate sobre uno sin fecha", () => {
    const ids = latestStatementIdsPerIssuer([
      { id: "dated", issuer: "icbc", closingDate: d("2026-01-01"), uploadedAt: d("2026-01-02") },
      { id: "undated", issuer: "icbc", closingDate: null, uploadedAt: d("2026-09-01") },
    ]);
    expect(ids).toEqual(["dated"]);
  });

  it("devuelve lista vacía sin resúmenes", () => {
    expect(latestStatementIdsPerIssuer([])).toEqual([]);
  });
});

describe("statementsBefore", () => {
  const icbc = (id: string, closing: string | null, uploaded: string) => ({
    id, issuer: "icbc", closingDate: closing ? d(closing) : null, uploadedAt: d(uploaded),
  });

  it("devuelve los resúmenes anteriores del mismo issuer, del más nuevo al más viejo", () => {
    const target = icbc("t", "2026-07-02", "2026-07-03");
    const before = statementsBefore(target, [
      icbc("may", "2026-05-02", "2026-05-03"),
      target,
      { id: "visa", issuer: "visa_signature", closingDate: d("2026-06-02"), uploadedAt: d("2026-06-03") },
      icbc("jun", "2026-06-02", "2026-06-03"),
      icbc("ago", "2026-08-02", "2026-08-03"),
    ]);
    expect(before.map((statement) => statement.id)).toEqual(["jun", "may"]);
  });

  it("desempata por uploadedAt con el mismo cierre", () => {
    const target = icbc("t", "2026-07-02", "2026-07-10");
    const before = statementsBefore(target, [
      icbc("viejo", "2026-07-02", "2026-07-03"),
      icbc("nuevo", "2026-07-02", "2026-07-20"),
      target,
    ]);
    expect(before.map((statement) => statement.id)).toEqual(["viejo"]);
  });

  it("los resúmenes sin cierre quedan como los más viejos", () => {
    const target = icbc("t", "2026-07-02", "2026-07-03");
    const before = statementsBefore(target, [
      icbc("sin-cierre", null, "2026-09-01"),
      icbc("jun", "2026-06-02", "2026-06-03"),
    ]);
    expect(before.map((statement) => statement.id)).toEqual(["jun", "sin-cierre"]);
  });

  it("sin anteriores devuelve una lista vacía", () => {
    const target = icbc("t", "2026-07-02", "2026-07-03");
    expect(statementsBefore(target, [target])).toEqual([]);
  });
});
