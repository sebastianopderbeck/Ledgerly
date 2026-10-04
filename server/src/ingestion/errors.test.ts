import { describe, it, expect } from "vitest";
import {
  EncryptedPdfError, IngestionError, InvalidAutoCouponError, InvalidCouponError, InvalidPayslipError,
  NoTextError, NoTransactionsError, UnsupportedFormatError,
} from "./errors.js";

describe("errores de ingestión", () => {
  it("todos extienden IngestionError y conservan su nombre y mensaje", () => {
    const errors = [
      new NoTextError(), new UnsupportedFormatError(), new NoTransactionsError(), new InvalidCouponError(),
      new InvalidAutoCouponError(), new InvalidPayslipError(), new EncryptedPdfError(),
    ];
    for (const error of errors) {
      expect(error).toBeInstanceOf(IngestionError);
      expect(error).toBeInstanceOf(Error);
      expect(error.message.length).toBeGreaterThan(0);
    }
    expect(errors.map((error) => error.name)).toEqual([
      "NoTextError", "UnsupportedFormatError", "NoTransactionsError", "InvalidCouponError",
      "InvalidAutoCouponError", "InvalidPayslipError", "EncryptedPdfError",
    ]);
  });

  it("EncryptedPdfError explica que el PDF tiene contraseña", () => {
    expect(new EncryptedPdfError().message).toBe("El PDF está protegido con contraseña");
  });
});
