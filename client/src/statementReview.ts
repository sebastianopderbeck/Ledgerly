export function applyReviewedDelta(current: string[], keys: string[], reviewed: boolean): string[] {
  const unique = [...new Set(current)];
  if (!reviewed) {
    const removed = new Set(keys);
    return unique.filter((key) => !removed.has(key));
  }
  const present = new Set(unique);
  const added = [...new Set(keys)].filter((key) => !present.has(key));
  return [...unique, ...added];
}
