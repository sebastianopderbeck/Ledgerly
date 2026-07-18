import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { detectDocumentKind } from "./detectDocumentKind.js";
import type { PdfMeta } from "@ledgerly/shared";

const meta: PdfMeta = { producer: null, creator: null, pageCount: 1, encrypted: false };
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const coupon = read("../parsers/__fixtures__/icbc-mortgage.sample.txt");
const statement = read("../parsers/__fixtures__/icbc.sample.txt");
const autoCoupon = read("../parsers/__fixtures__/auto-plan.sample.txt");

describe("detectDocumentKind", () => {
  it("clasifica un cupón (aunque contenga 'ICBC')", () => {
    expect(detectDocumentKind(coupon, meta)).toBe("coupon");
  });
  it("clasifica un extracto de tarjeta", () => {
    expect(detectDocumentKind(statement, meta)).toBe("statement");
  });
  it("devuelve unknown para texto ajeno", () => {
    expect(detectDocumentKind("texto de un documento cualquiera", meta)).toBe("unknown");
  });
});

describe("detectDocumentKind (auto)", () => {
  it("clasifica un cupón de plan de auto", () => {
    expect(detectDocumentKind(autoCoupon, meta)).toBe("auto");
  });
});
