import { describe, it, expect } from "vitest";
import type { ImportedFileDTO } from "@ledgerly/shared";
import {
  EMPTY_IMPORTED_FILES_FILTERS, filterImportedFiles, importedFileYears, type ImportedFilesFilters,
} from "./importedFiles.js";

const file = (overrides: Partial<ImportedFileDTO>): ImportedFileDTO => ({
  id: "x", kind: "statement", fileName: "x.pdf", uploadedAt: "2026-07-05T12:00:00.000Z",
  documentDate: "2026-07-02", description: "", needsReview: false, ...overrides,
});

const files: ImportedFileDTO[] = [
  file({ id: "visa", kind: "statement", fileName: "visa-julio.pdf", description: "Visa ****1234 · 3 movimientos", needsReview: true }),
  file({ id: "cupon", kind: "coupon", fileName: "cupon-1.pdf", documentDate: "2025-08-18", description: "Préstamo 0405 · cuota 1" }),
  file({ id: "auto", kind: "auto", fileName: "auto-2.pdf", documentDate: "2024-11-11", description: "Grupo 3684 · cuota 2" }),
  file({ id: "recibo", kind: "payslip", fileName: "recibo.pdf", documentDate: null, uploadedAt: "2025-03-01T12:00:00.000Z", description: "Período 2025-02" }),
];

const ids = (filters: Partial<ImportedFilesFilters>) =>
  filterImportedFiles(files, { ...EMPTY_IMPORTED_FILES_FILTERS, ...filters }).map((f) => f.id);

describe("filterImportedFiles", () => {
  it("sin filtros devuelve todos los archivos", () => {
    expect(ids({})).toEqual(["visa", "cupon", "auto", "recibo"]);
  });

  it("filtra por uno o más tipos", () => {
    expect(ids({ kinds: ["coupon", "auto"] })).toEqual(["cupon", "auto"]);
  });

  it("filtra por el año del documento", () => {
    expect(ids({ year: "2025" })).toEqual(["cupon", "recibo"]);
  });

  it("usa la fecha de importación cuando el documento no tiene fecha", () => {
    expect(ids({ year: "2025", kinds: ["payslip"] })).toEqual(["recibo"]);
  });

  it("busca en el nombre del archivo sin importar mayúsculas", () => {
    expect(ids({ search: "VISA" })).toEqual(["visa"]);
  });

  it("busca en el detalle sin importar acentos", () => {
    expect(ids({ search: "prestamo" })).toEqual(["cupon"]);
    expect(ids({ search: "periodo 2025" })).toEqual(["recibo"]);
  });

  it("muestra solo los que hay que revisar", () => {
    expect(ids({ onlyNeedsReview: true })).toEqual(["visa"]);
  });

  it("combina los filtros", () => {
    expect(ids({ kinds: ["statement", "coupon"], year: "2026" })).toEqual(["visa"]);
  });
});

describe("importedFileYears", () => {
  it("devuelve los años de los archivos sin repetir, del más nuevo al más viejo", () => {
    expect(importedFileYears(files)).toEqual(["2026", "2025", "2024"]);
  });

  it("sin archivos no hay años", () => {
    expect(importedFileYears([])).toEqual([]);
  });
});
