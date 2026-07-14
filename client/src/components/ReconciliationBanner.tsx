import { Alert, AlertTitle } from "@mui/material";
import type { ReconciliationResult } from "@ledgerly/shared";
import { formatMoney } from "../format.js";

interface ReconciliationBannerProps { reconciliation: ReconciliationResult; }

export const ReconciliationBanner = ({ reconciliation }: ReconciliationBannerProps) => {
  if (reconciliation.ok) return null;
  const failed = reconciliation.entries.filter((e) => !e.ok);
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      <AlertTitle>La reconciliación no cuadra</AlertTitle>
      {failed.map((e) => (
        <div key={e.currency}>
          {e.currency}: esperado {formatMoney(e.expected, e.currency)}, parseado {formatMoney(e.parsed, e.currency)} (dif {formatMoney(e.diff, e.currency)})
        </div>
      ))}
    </Alert>
  );
};
