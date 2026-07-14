export function formatMoney(amount: number, currency: "ARS" | "USD"): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function formatMoneyCompact(amount: number, currency: "ARS" | "USD"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency, notation: "compact", maximumFractionDigits: 1,
  }).format(amount);
}
