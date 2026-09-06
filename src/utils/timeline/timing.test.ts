import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@/services/project/factory'
import { DEFAULT_TRANSFORM } from '@/types/editor'
import {
  clampClipTiming,
  clampDurationFrames,
  contentEndFrame,
  ensureDurationFrames,
  limitedMoveDelta,
  rescaleProjectFps,
  sourceLength,
  trimLeftTo,
  trimRightTo,
} from '@/utils/timeline/timing'

function videoClip(overrides: Partial<Parameters<typeof trimLeftTo>[1]> = {}) {
  return {
    id: 'c1',
    trackId: 'video-1',
    type: 'video' as const,
    materialId: 'mat-v',
    startFrame: 100,
    durationFrames: 50,
    offsetFrame: 10,
    name: 'clip',
    zIndex: 0,
    locked: false,
    transform: { ...DEFAULT_TRANSFORM },
    ...overrides,
  }
}

describe('clip timing', () => {
  it('lets video clips restore trimmed in/out points within the source', () => {
    const project = createEmptyProject()
    project.materials.push({ id: 'mat-v', type: 'video', name: 'a.mp4', mimeType: 'video/mp4', size: 1, durationFrames: 200 })
    const clip = videoClip()
    expect(sourceLength(project, clip)).toBe(200)

    const leftExtend = trimLeftTo(project, clip, 80)
    expect(leftExtend).toEqual({ startFrame: 90, durationFrames: 60, offsetFrame: 0 })

    const leftTrim = trimLeftTo(project, clip, 120)
    expect(leftTrim).toEqual({ startFrame: 120, durationFrames: 30, offsetFrame: 30 })

    const rightExtend = trimRightTo(project, clip, 400)
    expect(rightExtend.durationFrames).toBe(190)
    expect(rightExtend.offsetFrame).toBe(10)

    const rightTrim = trimRightTo(project, clip, 120)
    expect(rightTrim.durationFrames).toBe(20)
  })

  it('lets image and text clips grow in both directions', () => {
    const project = createEmptyProject()
    const clip = videoClip({ type: 'image', materialId: 'mat-i', offsetFrame: 0 })
    const left = trimLeftTo(project, clip, 40)
    expect(left).toEqual({ startFrame: 40, durationFrames: 110, offsetFrame: 0 })
    const right = trimRightTo(project, clip, 400)
    expect(right.durationFrames).toBe(300)
  })

  it('clamps duration and offset to remaining source media', () => {
    const project = createEmptyProject()
    project.materials.push({ id: 'mat-v', type: 'video', name: 'a.mp4', mimeType: 'video/mp4', size: 1, durationFrames: 80 })
    const clip = videoClip({ offsetFrame: 20, durationFrames: 40 })
    expect(clampClipTiming(project, clip, { offsetFrame: 70, durationFrames: 40 })).toEqual({
      startFrame: 100,
      durationFrames: 10,
      offsetFrame: 70,
    })
  })

  it('grows the timeline to fit clip content', () => {
    const project = createEmptyProject()
    project.clips.push(videoClip({ startFrame: 0, durationFrames: 2400, offsetFrame: 0 }))
    expect(ensureDurationFrames(project)).toBe(true)
    expect(project.settings.durationFrames).toBeGreaterThanOrEqual(2430)
    expect(clampDurationFrames(project, 100)).toBeGreaterThanOrEqual(contentEndFrame(project))
  })

  it('stops horizontal moves before they overlap another clip on the same track', () => {
    const project = createEmptyProject()
    project.clips.push(
      videoClip({ id: 'a', startFrame: 0, durationFrames: 40, offsetFrame: 0 }),
      videoClip({ id: 'b', startFrame: 80, durationFrames: 40, offsetFrame: 0 }),
    )
    const moving = [{ id: 'a', trackId: 'video-1', startFrame: 0, durationFrames: 40 }]
    expect(limitedMoveDelta(project, moving, 60)).toBe(40)
    expect(limitedMoveDelta(project, moving, 20)).toBe(20)
  })

  it('rescales clip frames when project fps changes', () => {
    const project = createEmptyProject()
    project.clips.push(videoClip({ startFrame: 30, durationFrames: 30, offsetFrame: 15 }))
    project.materials.push({ id: 'mat-v', type: 'video', name: 'a.mp4', mimeType: 'video/mp4', size: 1, durationFrames: 300 })
    rescaleProjectFps(project, 60)
    expect(project.settings.fps).toBe(60)
    expect(project.clips[0].startFrame).toBe(60)
    expect(project.clips[0].durationFrames).toBe(60)
    expect(project.clips[0].offsetFrame).toBe(30)
    expect(project.materials[0].durationFrames).toBe(600)
  })
})
