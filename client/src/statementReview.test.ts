import { describe, it, expect } from "vitest";
import { applyReviewedDelta } from "./statementReview.js";

describe("applyReviewedDelta", () => {
  it("tildar agrega las claves al final, sin repetir y manteniendo el orden", () => {
    expect(applyReviewedDelta(["tx:a"], ["tx:b", "tx:a", "tx:b"], true)).toEqual(["tx:a", "tx:b"]);
  });

  it("destildar saca las claves", () => {
    expect(applyReviewedDelta(["tx:a", "cat:Comida", "tx:b"], ["cat:Comida"], false)).toEqual(["tx:a", "tx:b"]);
  });

  it("es idempotente", () => {
    const once = applyReviewedDelta(["tx:a"], ["tx:b"], true);
    expect(applyReviewedDelta(once, ["tx:b"], true)).toEqual(once);
    expect(applyReviewedDelta(["tx:a"], ["tx:z"], false)).toEqual(["tx:a"]);
  });

  it("no deja duplicados que ya vinieran en la lista", () => {
    expect(applyReviewedDelta(["tx:a", "tx:a"], [], true)).toEqual(["tx:a"]);
  });
});
