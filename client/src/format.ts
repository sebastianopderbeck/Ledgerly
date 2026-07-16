export function formatMoney(amount: number, currency: "ARS" | "USD"): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function formatMoneyCompact(amount: number, currency: "ARS" | "USD"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency, notation: "compact", maximumFractionDigits: 1,
  }).format(amount);
}

export function formatMonthLabel(value: string): string {
  const [year, monthNumber] = value.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
