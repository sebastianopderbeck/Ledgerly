export class NoTextError extends Error {
  constructor() {
    super("No se pudo extraer texto del PDF (¿escaneado o corrupto?)");
    this.name = "NoTextError";
  }
}

export class UnsupportedFormatError extends Error {
  constructor() {
    super("Formato de resumen no reconocido");
    this.name = "UnsupportedFormatError";
  }
}

export class NoTransactionsError extends Error {
  constructor() {
    super("No se encontraron movimientos en el resumen");
    this.name = "NoTransactionsError";
  }
}

export class InvalidCouponError extends Error {
  constructor() {
    super("El cupón tiene un formato inesperado");
    this.name = "InvalidCouponError";
  }
}
