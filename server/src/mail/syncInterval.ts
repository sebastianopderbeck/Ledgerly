export const MIN_SYNC_INTERVAL_MINUTES = 15;

const INTEGER = /^\d+$/;

export function parseSyncInterval(raw: string | undefined): number | null {
  const value = raw?.trim() ?? "";
  if (!INTEGER.test(value)) return null;
  const minutes = Number(value);
  return minutes >= MIN_SYNC_INTERVAL_MINUTES ? minutes : null;
}
