export class IngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestionError";
  }
}

export class NoTextError extends IngestionError {
  constructor() {
    super("No se pudo extraer texto del PDF (¿escaneado o corrupto?)");
    this.name = "NoTextError";
  }
}

export class UnsupportedFormatError extends IngestionError {
  constructor() {
    super("Formato de resumen no reconocido");
    this.name = "UnsupportedFormatError";
  }
}

export class NoTransactionsError extends IngestionError {
  constructor() {
    super("No se encontraron movimientos en el resumen");
    this.name = "NoTransactionsError";
  }
}

export class InvalidStatementDatesError extends IngestionError {
  constructor() {
    super("El resumen tiene movimientos con fechas inválidas o fuera de su período");
    this.name = "InvalidStatementDatesError";
  }
}

export class InvalidCouponError extends IngestionError {
  constructor() {
    super("El cupón tiene un formato inesperado");
    this.name = "InvalidCouponError";
  }
}

export class InvalidAutoCouponError extends IngestionError {
  constructor() {
    super("El cupón del plan de auto tiene un formato inesperado");
    this.name = "InvalidAutoCouponError";
  }
}

export class InvalidPayslipError extends IngestionError {
  constructor() {
    super("El recibo de sueldo tiene un formato inesperado");
    this.name = "InvalidPayslipError";
  }
}

export class EncryptedPdfError extends IngestionError {
  constructor() {
    super("El PDF está protegido con contraseña");
    this.name = "EncryptedPdfError";
  }
}
