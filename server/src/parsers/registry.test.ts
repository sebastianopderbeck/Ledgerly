import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { detectParser } from "./registry.js";
import type { PdfMeta } from "@ledgerly/shared";

const read = (f: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${f}`, import.meta.url)), "utf8");
const meta: PdfMeta = { producer: null, creator: null, pageCount: 1, encrypted: false };

describe("detectParser", () => {
  it("elige Visa", () => {
    expect(detectParser(read("visa-signature.sample.txt"), meta)?.issuer).toBe("visa_signature");
  });
  it("elige ICBC", () => {
    expect(detectParser(read("icbc.sample.txt"), meta)?.issuer).toBe("icbc");
  });
  it("devuelve null si no reconoce", () => {
    expect(detectParser("texto de un banco desconocido", meta)).toBeNull();
  });
});
