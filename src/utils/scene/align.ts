import type { TimelineClip } from '@/types/editor'
import { clipAabb } from '@/utils/scene/bounds'

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

export function alignedPositions(clips: TimelineClip[], mode: AlignMode): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()
  if (clips.length < 2) return result
  const boxes = clips.map((clip) => ({ clip, box: clipAabb(clip.transform) }))
  const left = Math.min(...boxes.map((item) => item.box.x))
  const right = Math.max(...boxes.map((item) => item.box.x + item.box.width))
  const top = Math.min(...boxes.map((item) => item.box.y))
  const bottom = Math.max(...boxes.map((item) => item.box.y + item.box.height))
  const center = (left + right) / 2
  const middle = (top + bottom) / 2
  boxes.forEach(({ clip, box }) => {
    let x = clip.transform.x
    let y = clip.transform.y
    if (mode === 'left') x += left - box.x
    if (mode === 'right') x += right - (box.x + box.width)
    if (mode === 'center') x += center - (box.x + box.width / 2)
    if (mode === 'top') y += top - box.y
    if (mode === 'middle') y += middle - (box.y + box.height / 2)
    if (mode === 'bottom') y += bottom - (box.y + box.height)
    result.set(clip.id, { x: Math.round(x), y: Math.round(y) })
  })
  return result
}
