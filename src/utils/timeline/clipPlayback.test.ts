import { describe, expect, it } from 'vitest'
import { audioFade, canvasFilter, clipMotion, clipSpeed, durationForSpeed, visualFade } from '@/utils/timeline/clipPlayback'
import { DEFAULT_TRANSFORM } from '@/types/editor'

describe('clip playback', () => {
  it('maps timeline frames through speed', () => {
    expect(clipSpeed({ speed: 2 })).toBe(2)
    expect(durationForSpeed(90, 2)).toBe(45)
    expect(durationForSpeed(90, 0.5)).toBe(180)
  })

  it('fades opacity at clip edges', () => {
    const clip = { startFrame: 10, durationFrames: 20, fadeInFrames: 5, fadeOutFrames: 5, transform: DEFAULT_TRANSFORM }
    expect(visualFade(clip, 10)).toBe(0)
    expect(visualFade(clip, 15)).toBe(1)
    expect(visualFade(clip, 29)).toBeCloseTo(0.2)
    expect(audioFade({ ...clip, audio: { volume: 1, muted: false, fadeInFrames: 10, fadeOutFrames: 0 } }, 15)).toBe(0.5)
  })

  it('skips canvas filter when values are default', () => {
    expect(canvasFilter({})).toBe('none')
    expect(canvasFilter({ filter: { brightness: 1.2, contrast: 1, saturation: 1 } })).toContain('brightness(1.2)')
  })

  it('slides in from the left and fades out', () => {
    const clip = { startFrame: 0, durationFrames: 30, transitionIn: { kind: 'slide-left' as const, durationFrames: 10 }, transitionOut: { kind: 'fade' as const, durationFrames: 10 } }
    const start = clipMotion(clip, 0, 1920, 1080)
    expect(start.dx).toBeLessThan(0)
    expect(clipMotion(clip, 10, 1920, 1080).dx).toBeCloseTo(0)
    expect(clipMotion(clip, 29, 1920, 1080).opacity).toBeCloseTo(0.1)
  })

  it('fades in linearly through transitionIn', () => {
    const clip = { startFrame: 0, durationFrames: 20, transitionIn: { kind: 'fade' as const, durationFrames: 10 } }
    expect(visualFade(clip, 0)).toBe(0)
    expect(visualFade(clip, 5)).toBe(0.5)
    expect(visualFade(clip, 10)).toBe(1)
  })

  it('slides from each edge and zooms in', () => {
    const base = { startFrame: 0, durationFrames: 20 }
    expect(clipMotion({ ...base, transitionIn: { kind: 'slide-right' as const, durationFrames: 8 } }, 0, 1920, 1080).dx).toBeGreaterThan(0)
    expect(clipMotion({ ...base, transitionIn: { kind: 'slide-up' as const, durationFrames: 8 } }, 0, 1920, 1080).dy).toBeLessThan(0)
    expect(clipMotion({ ...base, transitionIn: { kind: 'slide-down' as const, durationFrames: 8 } }, 0, 1920, 1080).dy).toBeGreaterThan(0)
    expect(clipMotion({ ...base, transitionIn: { kind: 'zoom' as const, durationFrames: 8 } }, 0, 1920, 1080).scale).toBeLessThan(1)
  })
})
