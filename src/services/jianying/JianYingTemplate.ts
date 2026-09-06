export const JIANYING_VERSION = '13.0.0'
export const JIANYING_MAPPER_ID = 'jy-13'

export function framesToUs(frames: number, fps: number): number {
  return Math.round(Math.max(0, frames) / fps * 1_000_000)
}

export function canvasRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
  const divisor = gcd(width, height) || 1
  return `${width / divisor}:${height / divisor}`
}

export interface JianYingTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  alpha: number
}

export function mapTransform(x: number, y: number, width: number, height: number, scaleX: number, scaleY: number, rotation: number, opacity: number, canvasWidth: number, canvasHeight: number): JianYingTransform {
  return {
    x: Number(((x - canvasWidth / 2) / (canvasWidth / 2)).toFixed(6)),
    y: Number(((canvasHeight / 2 - y) / (canvasHeight / 2)).toFixed(6)),
    scaleX: Number(((width * scaleX) / canvasWidth).toFixed(6)),
    scaleY: Number(((height * scaleY) / canvasHeight).toFixed(6)),
    rotation,
    alpha: opacity,
  }
}
