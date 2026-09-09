import { describe, expect, it } from 'vitest'
import { DEFAULT_TRANSFORM } from '@/types/editor'
import { snappedGroupDelta, snapTransform } from '@/utils/scene/snapping'

describe('snapping', () => {
  it('keeps a multi-clip drag as one snapped delta', () => {
    const leader = { ...DEFAULT_TRANSFORM, x: 200, y: 200, width: 100, height: 100 }
    const other = {
      id: 'guide',
      trackId: 'visual-1',
      type: 'video' as const,
      startFrame: 0,
      durationFrames: 30,
      offsetFrame: 0,
      name: 'guide',
      zIndex: 0,
      locked: false,
      transform: { ...DEFAULT_TRANSFORM, x: 400, y: 200, width: 100, height: 100 },
    }
    const single = snapTransform({ ...leader, x: 392, y: 200 }, { width: 1920, height: 1080 }, [other])
    const group = snappedGroupDelta(
      [
        { id: 'a', x: 200, y: 200 },
        { id: 'b', x: 80, y: 240 },
      ],
      192,
      0,
      leader,
      { width: 1920, height: 1080 },
      [other],
    )
    expect(group.x).toBe(single.transform.x - 200)
    expect(group.y).toBe(0)
    expect(group.guides.length).toBeGreaterThan(0)
  })
})
