import type { TimelineClip, Transform } from '@/types/editor'
import { rotatePoint, type Point } from '@/utils/scene/geometry'

export interface Rect { x: number; y: number; width: number; height: number }

export function clipCorners(transform: Transform): Point[] {
  const hw = transform.width * transform.scaleX / 2
  const hh = transform.height * transform.scaleY / 2
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((point) => {
    const rotated = rotatePoint(point, transform.rotation)
    return { x: rotated.x + transform.x, y: rotated.y + transform.y }
  })
}

export function clipAabb(transform: Transform): Rect {
  const corners = clipCorners(transform)
  const xs = corners.map((point) => point.x)
  const ys = corners.map((point) => point.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }
}

export function selectionBounds(clips: TimelineClip[]): Rect | null {
  if (!clips.length) return null
  const boxes = clips.map((clip) => clipAabb(clip.transform))
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function normalizeRect(start: Point, end: Point): Rect {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  return { x, y, width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }
}

export function boundsToTransform(bounds: Rect): Transform {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height),
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
  }
}
