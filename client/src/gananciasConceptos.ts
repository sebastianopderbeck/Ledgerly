import type { PayslipDTO } from "@ledgerly/shared";

const JUBILACION = ["0401", "0403"];
const LEY_19032 = ["0402", "0454"];
const OBRA_SOCIAL = ["0405", "0407", "0314"];
const SEC = ["0422"];
const FAECYS = ["0425"];

export const CODIGOS_APORTES_DEDUCIBLES: ReadonlySet<string> = new Set([
  ...JUBILACION, ...LEY_19032, ...OBRA_SOCIAL, ...SEC, ...FAECYS,
]);

const RETENCION_4TA = "0430";
const DEVOLUCION_4TA = "0433";

export const CODIGOS_RETENIDO: ReadonlySet<string> = new Set([RETENCION_4TA, DEVOLUCION_4TA]);

export const CODIGO_AJUSTE_ANIO_ANTERIOR = "0446";

export const sumarConceptos = (payslip: PayslipDTO, codigos: ReadonlySet<string>): number =>
  payslip.conceptos
    .filter((concepto) => codigos.has(concepto.codigo))
    .reduce((total, concepto) => total + concepto.monto, 0);
