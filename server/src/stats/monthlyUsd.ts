export function representativeRateDate(month: string, todayIso: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
  return monthEnd > todayIso ? todayIso : monthEnd;
}

export function consumptionMonth(closingDateIso: string): string {
  const [year, monthNum, day] = closingDateIso.split("-").map(Number);
  const base = new Date(Date.UTC(year, monthNum - 1, 1));
  if (day <= 15) base.setUTCMonth(base.getUTCMonth() - 1);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
}
