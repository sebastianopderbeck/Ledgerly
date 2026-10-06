import type { OcrObservation } from "./recognizeImage.js";

interface Row {
  y: number;
  height: number;
  items: OcrObservation[];
}

const sameRow = (row: Row, observation: OcrObservation): boolean =>
  Math.abs(observation.y - row.y) < Math.max(row.height, observation.height) / 2;

const rowText = (row: Row): string =>
  [...row.items].sort((a, b) => a.x - b.x).map((item) => item.text).join(" ");

export function toLines(observations: OcrObservation[]): string {
  const rows: Row[] = [];
  for (const observation of [...observations].sort((a, b) => a.y - b.y)) {
    const row = rows.at(-1);
    if (row && sameRow(row, observation)) row.items.push(observation);
    else rows.push({ y: observation.y, height: observation.height, items: [observation] });
  }
  return rows.map(rowText).join("\n");
}
