import type { TimelineClip, Transform } from '@/types/editor'

export interface AlignmentGuide { orientation: 'horizontal' | 'vertical'; position: number }

interface SnapResult { transform: Pick<Transform, 'x' | 'y'>; guides: AlignmentGuide[] }

function positions(transform: Transform, axis: 'x' | 'y'): number[] {
  const size = axis === 'x' ? transform.width * transform.scaleX : transform.height * transform.scaleY
  const center = transform[axis]
  return [center - size / 2, center, center + size / 2]
}

export function snapTransform(transform: Transform, projectSize: { width: number; height: number }, others: TimelineClip[], threshold = 8): SnapResult {
  const vertical = [0, projectSize.width / 2, projectSize.width]
  const horizontal = [0, projectSize.height / 2, projectSize.height]
  others.forEach((clip) => { vertical.push(...positions(clip.transform, 'x')); horizontal.push(...positions(clip.transform, 'y')) })
  const result = { x: transform.x, y: transform.y }
  const guides: AlignmentGuide[] = []
  ;(['x', 'y'] as const).forEach((axis) => {
    const candidates = axis === 'x' ? vertical : horizontal
    const own = positions(transform, axis)
    let best: { delta: number; position: number } | undefined
    own.forEach((value) => candidates.forEach((position) => {
      const delta = position - value
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, position }
    }))
    if (best) { result[axis] += best.delta; guides.push({ orientation: axis === 'x' ? 'vertical' : 'horizontal', position: best.position }) }
  })
  return { transform: result, guides }
}

export function snappedGroupDelta(
  starts: Array<{ id: string; x: number; y: number }>,
  dx: number,
  dy: number,
  leader: Transform,
  projectSize: { width: number; height: number },
  others: TimelineClip[],
): { x: number; y: number; guides: AlignmentGuide[] } {
  const origin = starts[0]
  if (!origin) return { x: dx, y: dy, guides: [] }
  const snapped = snapTransform({ ...leader, x: origin.x + dx, y: origin.y + dy }, projectSize, others)
  return { x: snapped.transform.x - origin.x, y: snapped.transform.y - origin.y, guides: snapped.guides }
}
