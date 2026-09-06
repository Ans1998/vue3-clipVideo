export interface Point { x: number; y: number }

export function rotatePoint(point: Point, degrees: number): Point {
  const angle = degrees * Math.PI / 180
  return { x: point.x * Math.cos(angle) - point.y * Math.sin(angle), y: point.x * Math.sin(angle) + point.y * Math.cos(angle) }
}

export function angleBetween(center: Point, point: Point): number {
  return Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI
}

export function normalizeDegrees(value: number): number {
  const normalized = value % 360
  return normalized < 0 ? normalized + 360 : normalized
}
