import type { MacroRefreshDTO } from "@ledgerly/shared";
import { backfillMacro } from "./backfillMacro.js";
import { refreshAllRates } from "./refreshRates.js";

export async function refreshMacroData(): Promise<MacroRefreshDTO> {
  const series = await backfillMacro();
  const tipoCambio = await refreshAllRates();
  return {
    series: {
      usdOficial: series.usd_oficial,
      uva: series.uva,
      tasa30: series.tasa30,
      inflacion: series.inflacion,
    },
    tipoCambio,
  };
}
