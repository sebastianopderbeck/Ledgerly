import { describe, it, expect, beforeAll } from "vitest";
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withDb } from "../testing/withDb.js";
import { seedPayslips } from "./seedPayslips.js";
import { PayslipModel } from "../db/models.js";

const dir = fileURLToPath(new URL("../../../examples/recibos/", import.meta.url));
const hasReal = existsSync(dir);

const MENSUAL = "Junio_2026_18_Legajo_56_Empleado-Empleador.PDF";
const SAC = "1er_SAC_2026_18_Legajo_56_Empleado-Empleador.PDF";
const NO_PARSEABLE = "Anticipos_de_sueldo_16_Legajo_56_Empleado-Empleador.PDF";

withDb();

describe.skipIf(!hasReal)("seedPayslips", () => {
  let subset: string;

  beforeAll(() => {
    subset = `${mkdtempSync(join(tmpdir(), "recibos-"))}/`;
    for (const file of [MENSUAL, SAC, NO_PARSEABLE]) copyFileSync(dir + file, subset + file);
  });

  it("omite los recibos que no puede parsear en vez de cortar la corrida", async () => {
    const result = await seedPayslips(subset);
    expect(result.imported).toBe(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toContain("Anticipos_de_sueldo");
  }, 30000);

  it("guarda el aguinaldo junto al recibo mensual del mismo período", async () => {
    await seedPayslips(subset);
    expect(await PayslipModel.countDocuments({ periodo: "2026-06" })).toBe(2);
    expect(await PayslipModel.countDocuments({ tipo: "sac" })).toBe(1);
  }, 30000);
});
