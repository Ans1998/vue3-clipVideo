import type { Transform } from '@/types/editor'
import type { Point } from '@/utils/scene/geometry'

export function groupResizePatches(
  starts: Array<{ id: string; transform: Transform }>,
  bounds: Transform,
  handle: string,
  point: Point,
  keepRatio: boolean,
): Array<{ id: string; patch: Partial<Transform> }> {
  const left = bounds.x - bounds.width / 2
  const top = bounds.y - bounds.height / 2
  const right = bounds.x + bounds.width / 2
  const bottom = bounds.y + bounds.height / 2
  let nextLeft = left
  let nextTop = top
  let nextRight = right
  let nextBottom = bottom
  if (handle.includes('e')) nextRight = point.x
  if (handle.includes('w')) nextLeft = point.x
  if (handle.includes('s')) nextBottom = point.y
  if (handle.includes('n')) nextTop = point.y
  const width = Math.max(24, Math.abs(nextRight - nextLeft))
  const height = Math.max(24, Math.abs(nextBottom - nextTop))
  let scaleX = /e|w/.test(handle) ? width / bounds.width : 1
  let scaleY = /n|s/.test(handle) ? height / bounds.height : 1
  if (keepRatio) {
    const factor = /e|w/.test(handle) && /n|s/.test(handle)
      ? Math.max(scaleX, scaleY)
      : /e|w/.test(handle) ? scaleX : scaleY
    scaleX = factor
    scaleY = factor
  }
  const originX = handle.includes('w') ? right : handle.includes('e') ? left : bounds.x
  const originY = handle.includes('n') ? bottom : handle.includes('s') ? top : bounds.y
  return starts.map((item) => ({
    id: item.id,
    patch: {
      x: Math.round(originX + (item.transform.x - originX) * scaleX),
      y: Math.round(originY + (item.transform.y - originY) * scaleY),
      scaleX: item.transform.scaleX * scaleX,
      scaleY: item.transform.scaleY * scaleY,
    },
  }))
}
