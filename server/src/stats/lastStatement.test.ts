import { describe, it, expect } from "vitest";
import { latestStatementIdsPerIssuer } from "./lastStatement.js";

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
