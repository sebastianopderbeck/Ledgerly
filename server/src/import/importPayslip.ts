import type { ExtractedPdf } from "@ledgerly/shared";
import { createHash } from "node:crypto";
import { parsePayslip } from "../ingestion/parsePayslip.js";
import { PayslipModel } from "../db/models.js";
import { fetchOficialRate } from "../fx/dollarRate.js";

export async function importPayslip(input: {
  data: Uint8Array;
  fileName: string;
  replace?: boolean;
  extracted?: ExtractedPdf;
}): Promise<{ status: "imported" | "duplicate"; payslipId: string }> {
  const sourceHash = createHash("sha256").update(input.data).digest("hex");
  const { payslip } = await parsePayslip(input.data, input.extracted, input.fileName);

  const existing = await PayslipModel.findOne({ cuil: payslip.cuil, periodo: payslip.periodo, tipo: payslip.tipo });
  if (existing && !input.replace) return { status: "duplicate", payslipId: existing._id.toString() };
  if (existing && input.replace) await PayslipModel.deleteOne({ _id: existing._id });

  const tipoCambioUsd = await fetchOficialRate(payslip.fechaPago).catch(() => null);

  const created = await PayslipModel.create({
    periodo: payslip.periodo,
    tipo: payslip.tipo,
    fechaPago: new Date(payslip.fechaPago),
    cuil: payslip.cuil,
    conceptos: payslip.conceptos,
    remunerativo: payslip.remunerativo,
    noRemunerativo: payslip.noRemunerativo,
    descuentos: payslip.descuentos,
    brutoTotal: payslip.brutoTotal,
    neto: payslip.neto,
    costoTotalEmpleador: payslip.costoTotalEmpleador,
    sourceFileName: input.fileName,
    sourceHash,
    tipoCambioUsd,
    tipoCambioSource: tipoCambioUsd != null ? "api" : null,
  });
  return { status: "imported", payslipId: created._id.toString() };
}
