import type {
  AutoCouponDTO, AutoSummaryDTO, CreditSummaryDTO, Issuer, MacroSeriesDTO, MortgageCouponDTO, PayslipDTO, StatementDTO,
} from "@ledgerly/shared";
import type { Vencimiento, VencimientosInput } from "../vencimientos.js";

interface StatementFixture {
  id: string;
  issuer: Issuer;
  dueDate: string | null;
  closingDate?: string | null;
  saldoArs?: number;
  saldoUsd?: number;
  minimoArs?: number;
  uploadedAt?: string;
}

interface PayslipFixture {
  neto?: number;
  tipo?: PayslipDTO["tipo"];
}

const CARD_LABELS: Record<Issuer, string> = { visa_signature: "Visa Signature", icbc: "ICBC" };

export const statement = ({
  id, issuer, dueDate, closingDate = null, saldoArs = 0, saldoUsd = 0, minimoArs = 0, uploadedAt = "2026-10-01T10:00:00.000Z",
}: StatementFixture): StatementDTO => ({
  id,
  issuer,
  cardLabel: CARD_LABELS[issuer],
  last4: "0000",
  closingDate,
  dueDate,
  totals: {
    totalConsumos: { ars: saldoArs, usd: saldoUsd },
    saldoActual: { ars: saldoArs, usd: saldoUsd },
    pagoMinimo: { ars: minimoArs, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: `${id}.pdf`,
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
  transactionCount: 0,
  uploadedAt,
});

export const creditCoupon = (cuotaNro: number, fechaDebito: string, overrides: Partial<MortgageCouponDTO> = {}): MortgageCouponDTO => ({
  id: `credito-${cuotaNro}`,
  prestamoNro: "0000000001",
  cuotaNro,
  fechaDebito,
  capital: 100_000,
  intereses: 50_000,
  seguroIncendio: 4_000,
  totalDebitado: 160_000,
  cuotaPuraUva: 100,
  cotizacionUva: 1_500,
  capitalUva: 66.67,
  interesUva: 33.33,
  tea: 5,
  tna: 4.9,
  cft: 6,
  tipoCambioUsd: null,
  tipoCambioSource: null,
  totalUsd: null,
  ...overrides,
});

export const autoCoupon = (cuotaNro: number, fechaVencimiento: string, totalAPagar = 250_000): AutoCouponDTO => ({
  id: `auto-${cuotaNro}`,
  grupo: "1234",
  orden: "056",
  cuotaNro,
  plan: "Plan sintético 70/30",
  fechaEmision: fechaVencimiento,
  fechaVencimiento,
  comprobante: `C-${cuotaNro}`,
  modelo: "Auto sintético",
  valorMovil: 20_000_000,
  conceptos: [],
  totalAPagar,
  tipoCambioUsd: null,
  tipoCambioSource: null,
  totalUsd: null,
});

export const payslip = (periodo: string, fechaPago: string, { neto = 2_100_000, tipo = "mensual" }: PayslipFixture = {}): PayslipDTO => ({
  id: `recibo-${periodo}-${tipo}`,
  periodo,
  tipo,
  fechaPago,
  cuil: "20-00000000-0",
  conceptos: [],
  remunerativo: neto,
  noRemunerativo: 0,
  descuentos: 0,
  brutoTotal: neto,
  neto,
  costoTotalEmpleador: null,
  tipoCambioUsd: null,
  tipoCambioSource: null,
  netoUsd: null,
});

export const creditSummary = (cuotasTotales: number): CreditSummaryDTO => ({
  prestamoNro: "0000000001",
  cuotasPagadas: 24,
  cuotasTotales,
  totalPagado: 1,
  capitalPagado: 1,
  interesPagado: 1,
  seguroPagado: 1,
  capitalOriginalUva: 1,
  capitalAmortizadoUva: 1,
  capitalPendienteUva: 1,
  capitalPendientePesos: 1,
  porcentajeAvanceCapital: 0.1,
  cotizacionUvaActual: 1_500,
  cuotaPuraUva: 100,
  tna: 4.9,
  tasaRealMensual: 0.004,
});

export const autoSummary = (cuotasTotales: number): AutoSummaryDTO => ({
  grupo: "1234",
  orden: "056",
  plan: "Plan sintético 70/30",
  modelo: "Auto sintético",
  cuotasPagadas: 25,
  cuotasTotales,
  porcentajeAvance: 0.2,
  totalPagado: 1,
  valorActualAuto: 20_000_000,
  totalPagadoUsd: 1,
  ultimaCuota: 25,
  fechaUltimoVencimiento: "2026-10-09",
});

export const macroSeries = (uva: number | null): MacroSeriesDTO => ({
  desde: "2025-01",
  meses: [],
  hoy: { fecha: "2026-10-02", usdOficial: 1_400, uva, tasa30: 30 },
});

type VencimientoFixture = Partial<Vencimiento> & Pick<Vencimiento, "fecha" | "titulo">;

export const vencimiento = (overrides: VencimientoFixture): Vencimiento => ({
  id: `${overrides.titulo}-${overrides.fecha}`,
  tipo: "tarjeta",
  sentido: "pago",
  estado: "confirmado",
  detalle: "Detalle sintético",
  monto: 100_000,
  montoUsd: null,
  montoAproximado: overrides.estado === "estimado",
  ...overrides,
});

export const entradaVacia = (): VencimientosInput => ({
  statements: [],
  creditCoupons: [],
  creditSummary: undefined,
  autoCoupons: [],
  autoSummary: undefined,
  payslips: [],
  uvaHoy: null,
});

export const ejemploVencimientos = (): VencimientosInput => ({
  statements: [
    statement({ id: "visa-08", issuer: "visa_signature", closingDate: "2026-07-31", dueDate: "2026-08-13", saldoArs: 700_000, minimoArs: 35_000 }),
    statement({ id: "visa-09", issuer: "visa_signature", closingDate: "2026-09-01", dueDate: "2026-09-14", saldoArs: 750_000, minimoArs: 37_000 }),
    statement({
      id: "visa-10", issuer: "visa_signature", closingDate: "2026-10-02", dueDate: "2026-10-13", saldoArs: 812_000, saldoUsd: 35, minimoArs: 42_000,
    }),
    statement({ id: "icbc-09", issuer: "icbc", closingDate: "2026-09-02", dueDate: "2026-09-14", saldoArs: 400_000, minimoArs: 20_000 }),
  ],
  creditCoupons: [creditCoupon(22, "2026-07-06"), creditCoupon(23, "2026-08-05"), creditCoupon(24, "2026-09-04")],
  creditSummary: creditSummary(240),
  autoCoupons: [autoCoupon(23, "2026-08-10"), autoCoupon(24, "2026-09-09"), autoCoupon(25, "2026-10-09", 260_000)],
  autoSummary: autoSummary(120),
  payslips: [payslip("2026-06", "2026-07-01"), payslip("2026-07", "2026-07-31"), payslip("2026-08", "2026-09-01")],
  uvaHoy: 2_000,
});
