import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@/services/project/factory'
import { DEFAULT_TRANSFORM } from '@/types/editor'
import { applyCanvasSize, CANVAS_PRESETS, fitCanvasZoom, matchingCanvasPreset } from '@/utils/scene/canvas'

describe('canvas presets', () => {
  it('matches 16:9 and 9:16 even when resolution differs', () => {
    expect(matchingCanvasPreset(1920, 1080)).toBe('16:9')
    expect(matchingCanvasPreset(1280, 720)).toBe('16:9')
    expect(matchingCanvasPreset(1080, 1920)).toBe('9:16')
    expect(matchingCanvasPreset(1080, 1080)).toBe('1:1')
    expect(matchingCanvasPreset(1234, 567)).toBe('custom')
  })

  it('keeps clips centered when switching 16:9 to 9:16', () => {
    const project = createEmptyProject()
    project.clips.push({
      id: 't',
      trackId: 'text-1',
      type: 'text',
      startFrame: 0,
      durationFrames: 30,
      offsetFrame: 0,
      name: 'title',
      zIndex: 0,
      locked: false,
      transform: { ...DEFAULT_TRANSFORM, x: 960, y: 540, width: 700, height: 150 },
    })
    const portrait = CANVAS_PRESETS.find((item) => item.id === '9:16')!
    expect(applyCanvasSize(project, portrait.width, portrait.height)).toBe(true)
    expect(project.settings).toMatchObject({ width: 1080, height: 1920 })
    expect(project.clips[0].transform.x).toBe(540)
    expect(project.clips[0].transform.y).toBe(960)
    expect(applyCanvasSize(project, 1080, 1920)).toBe(false)
  })

  it('fits portrait canvases into the preview pane', () => {
    expect(fitCanvasZoom(800, 400, 1920, 1080)).toBeCloseTo((400 - 80) / 1080)
    expect(fitCanvasZoom(800, 400, 1080, 1920)).toBeCloseTo((400 - 80) / 1920)
    expect(fitCanvasZoom(1600, 900, 1920, 1080)).toBeLessThanOrEqual(0.72)
  })
})
