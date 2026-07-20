export function representativeRateDate(month: string, todayIso: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
  return monthEnd > todayIso ? todayIso : monthEnd;
}
