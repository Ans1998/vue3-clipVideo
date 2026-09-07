import type { Transform } from '@/types/editor'
import { clipAabb } from '@/utils/scene/bounds'

export interface OverlayFrame {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  clamped: boolean
}

const INSET = 1

export function selectionOverlayFrame(
  transform: Transform,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number,
): OverlayFrame | null {
  const aabb = clipAabb(transform)
  const visLeft = Math.max(0, aabb.x)
  const visTop = Math.max(0, aabb.y)
  const visRight = Math.min(canvasWidth, aabb.x + aabb.width)
  const visBottom = Math.min(canvasHeight, aabb.y + aabb.height)
  if (visRight - visLeft < 2 || visBottom - visTop < 2) return null

  const overflows = aabb.x < 0 || aabb.y < 0 || aabb.x + aabb.width > canvasWidth || aabb.y + aabb.height > canvasHeight
  if (!overflows) {
    const width = transform.width * transform.scaleX
    const height = transform.height * transform.scaleY
    return {
      x: (transform.x - width / 2) * zoom + INSET,
      y: (transform.y - height / 2) * zoom + INSET,
      width: Math.max(2, width * zoom - INSET * 2),
      height: Math.max(2, height * zoom - INSET * 2),
      rotation: transform.rotation,
      clamped: false,
    }
  }

  return {
    x: visLeft * zoom + INSET,
    y: visTop * zoom + INSET,
    width: Math.max(2, (visRight - visLeft) * zoom - INSET * 2),
    height: Math.max(2, (visBottom - visTop) * zoom - INSET * 2),
    rotation: 0,
    clamped: true,
  }
}
