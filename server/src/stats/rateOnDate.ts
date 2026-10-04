export interface RatePoint {
  fecha: string;
  valor: number;
}

export function pointOnDate<Point extends RatePoint>(fecha: string, points: Point[]): Point | null {
  let low = 0;
  let high = points.length - 1;
  let found: Point | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].fecha <= fecha) {
      found = points[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

export function rateOnDate(fecha: string, points: RatePoint[]): number | null {
  return pointOnDate(fecha, points)?.valor ?? null;
}
