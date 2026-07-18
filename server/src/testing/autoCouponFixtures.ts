export interface RawAutoConcept {
  label: string;
  amount: number;
}

export interface RawAutoCoupon {
  grupo: string;
  orden: string;
  cuotaNro: number;
  plan: string;
  fechaEmision: string;
  fechaVencimiento: string;
  comprobante: string;
  modelo: string;
  valorMovil: number;
  conceptos: RawAutoConcept[];
  totalAPagar: number;
}

export const RAW_AUTO_COUPONS: RawAutoCoupon[] = [
  {
    grupo: "3684", orden: "97", cuotaNro: 2, plan: "K",
    fechaEmision: "2024-10-18", fechaVencimiento: "2024-11-11", comprobante: "000062757060",
    modelo: "C3 AIRCROSS T200 FEEL PK MY24", valorMovil: 28240000.01, totalAPagar: 268551.23,
    conceptos: [
      { label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 },
      { label: "PORCION DE ALICUOTA DIFERIDA", amount: -11767.85 },
      { label: "IVA SOBRE CONCEPTOS GRAVADOS", amount: 5067.9 },
      { label: "RECUP IMP BANCARIOS LEY 25413", amount: 2157.79 },
      { label: "DER. INSCRIP.PRORR. HIST (DIP)", amount: 34274.38 },
      { label: "GASTOS ADMINISTRATIVOS", amount: 22358.9 },
      { label: "SEGURO DE VIDA (SV)", amount: 23389.67 },
      { label: "DIFERIMIENTO COMERCIAL", amount: -70607.06 },
      { label: "ACTUALIZACIÓN VALOR HIST.DIP", amount: 1029.89 },
      { label: "GASTOS DE SELLADO PRORR (GSP)", amount: 26546.6 },
      { label: "ACTUALIZACIÓN VALOR HIST.GSP", amount: 744.03 },
    ],
  },
  {
    grupo: "3684", orden: "97", cuotaNro: 11, plan: "K",
    fechaEmision: "2025-07-18", fechaVencimiento: "2025-08-11", comprobante: "000063935746",
    modelo: "AIRCROSS T200 FEEL PK MY26", valorMovil: 32110000.0, totalAPagar: 323378.16,
    conceptos: [
      { label: "ANTICIPO ALICUOTA (AL)", amount: 267610.09 },
      { label: "IVA SOBRE CONCEPTOS GRAVADOS", amount: 8282.48 },
      { label: "RECUP IMP BANCARIOS LEY 25413", amount: 2598.32 },
      { label: "SEGURO DE VIDA (SV)", amount: 24908.95 },
      { label: "DER. INSCRIP.PRORR. HIST (DIP)", amount: 34274.38 },
      { label: "GASTOS ADMINISTRATIVOS", amount: 26761.01 },
      { label: "DIFERIMIENTO COMERCIAL", amount: -80283.03 },
      { label: "ACTUALIZACIÓN VALOR HIST.DIP", amount: 5867.98 },
      { label: "GASTOS DE SELLADO PRORR (GSP)", amount: 26546.6 },
      { label: "ACTUALIZACIÓN VALOR HIST.GSP", amount: 6811.38 },
    ],
  },
  {
    grupo: "3684", orden: "97", cuotaNro: 17, plan: "K",
    fechaEmision: "2026-01-19", fechaVencimiento: "2026-02-10", comprobante: "000064824409",
    modelo: "AIRCROSS T200 FEEL PK MY26", valorMovil: 40110000.0, totalAPagar: 394224.89,
    conceptos: [
      { label: "ANTICIPO ALICUOTA (AL)", amount: 334283.43 },
      { label: "IVA SOBRE CONCEPTOS GRAVADOS", amount: 10352.48 },
      { label: "RECUP IMP BANCARIOS LEY 25413", amount: 3167.56 },
      { label: "ACTUALIZACIÓN VALOR HIST.DIP", amount: 15869.19 },
      { label: "GASTOS ADMINISTRATIVOS", amount: 33428.34 },
      { label: "DER. INSCRIP.PRORR. HIST (DIP)", amount: 34274.38 },
      { label: "DIFERIMIENTO COMERCIAL", amount: -66856.69 },
      { label: "SEGURO DE VIDA (SV)", amount: 29706.2 },
    ],
  },
  {
    grupo: "3684", orden: "97", cuotaNro: 22, plan: "K",
    fechaEmision: "2026-06-19", fechaVencimiento: "2026-07-10", comprobante: "000065709903",
    modelo: "AIRCROSS T200 FEEL PK MY26", valorMovil: 41580000.0, totalAPagar: 442570.43,
    conceptos: [
      { label: "ANTICIPO ALICUOTA (AL)", amount: 346534.65 },
      { label: "IVA SOBRE CONCEPTOS GRAVADOS", amount: 10995.68 },
      { label: "RECUP IMP BANCARIOS LEY 25413", amount: 3556.02 },
      { label: "GASTOS ADMINISTRATIVOS", amount: 34653.47 },
      { label: "DIFERIMIENTO COMERCIAL", amount: -34653.47 },
      { label: "DER. INSCRIP.PRORR. HIST (DIP)", amount: 34274.38 },
      { label: "ACTUALIZACIÓN VALOR HIST.DIP", amount: 17706.91 },
      { label: "SEGURO DE VIDA (SV)", amount: 29502.78 },
    ],
  },
];
