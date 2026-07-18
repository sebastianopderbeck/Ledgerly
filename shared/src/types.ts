import type { Issuer, ParsedStatement } from "./schemas.js";

export interface PdfMeta {
  producer: string | null;
  creator: string | null;
  pageCount: number;
  encrypted: boolean;
}

export interface ExtractedPdf {
  text: string;
  meta: PdfMeta;
}

export interface StatementParser {
  issuer: Issuer;
  detect(text: string, meta: PdfMeta): boolean;
  parse(text: string, meta: PdfMeta): ParsedStatement;
}

export interface ParsedCoupon {
  prestamoNro: string;
  cuotaNro: number;
  fechaDebito: string;
  capital: number;
  intereses: number;
  seguroIncendio: number;
  totalDebitado: number;
  cuotaPuraUva: number;
  cotizacionUva: number;
  tea: number;
  tna: number;
  cft: number;
}

export interface MortgageCouponParser {
  detect(text: string, meta: PdfMeta): boolean;
  parse(text: string, meta: PdfMeta): ParsedCoupon;
}

export interface ParsedAutoConcept {
  label: string;
  amount: number;
}

export interface ParsedAutoCoupon {
  grupo: string;
  orden: string;
  cuotaNro: number;
  plan: string;
  fechaEmision: string;
  fechaVencimiento: string;
  comprobante: string;
  modelo: string;
  valorMovil: number;
  conceptos: ParsedAutoConcept[];
  totalAPagar: number;
}

export interface AutoCouponParser {
  detect(text: string, meta: PdfMeta): boolean;
  parse(text: string, meta: PdfMeta): ParsedAutoCoupon;
}
