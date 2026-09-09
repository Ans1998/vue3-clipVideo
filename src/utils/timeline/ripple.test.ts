import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@/services/project/factory'
import { DEFAULT_TRANSFORM } from '@/types/editor'
import { rippleRemove } from '@/utils/timeline/ripple'

describe('ripple edit', () => {
  it('pulls later clips on the same track forward', () => {
    const project = createEmptyProject()
    project.clips.push(
      { id: 'a', trackId: 'visual-1', type: 'video', startFrame: 0, durationFrames: 40, offsetFrame: 0, name: 'a', zIndex: 0, locked: false, transform: { ...DEFAULT_TRANSFORM } },
      { id: 'b', trackId: 'visual-1', type: 'video', startFrame: 80, durationFrames: 20, offsetFrame: 0, name: 'b', zIndex: 1, locked: false, transform: { ...DEFAULT_TRANSFORM } },
      { id: 'c', trackId: 'text-1', type: 'text', startFrame: 80, durationFrames: 20, offsetFrame: 0, name: 'c', zIndex: 2, locked: false, transform: { ...DEFAULT_TRANSFORM } },
    )
    rippleRemove(project, [project.clips[0]])
    expect(project.clips.map((clip) => ({ id: clip.id, startFrame: clip.startFrame }))).toEqual([
      { id: 'b', startFrame: 40 },
      { id: 'c', startFrame: 80 },
    ])
  })
})
