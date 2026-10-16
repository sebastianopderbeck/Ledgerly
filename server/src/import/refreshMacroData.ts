import type { MacroRefreshDTO } from "@ledgerly/shared";
import type { Types } from "mongoose";
import { backfillMacro } from "./backfillMacro.js";
import { refreshAllRates } from "./refreshRates.js";

export async function refreshMacroData(userId: Types.ObjectId): Promise<MacroRefreshDTO> {
  const series = await backfillMacro();
  const tipoCambio = await refreshAllRates(userId);
  return {
    series: {
      usdOficial: series.usd_oficial,
      uva: series.uva,
      tasa30: series.tasa30,
      rem12m: series.rem_12m,
      inflacion: series.inflacion,
    },
    tipoCambio,
  };
}
