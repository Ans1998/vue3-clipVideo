import { describe, expect, it } from 'vitest'
import { DEFAULT_TRANSFORM } from '@/types/editor'
import { selectionOverlayFrame } from '@/utils/scene/selectionOverlay'

describe('selectionOverlayFrame', () => {
  it('keeps an in-canvas clip aligned to its box', () => {
    const frame = selectionOverlayFrame(
      { ...DEFAULT_TRANSFORM, x: 400, y: 300, width: 200, height: 100, rotation: 15 },
      1,
      1920,
      1080,
    )
    expect(frame).toMatchObject({ x: 301, y: 251, width: 198, height: 98, rotation: 15, clamped: false })
  })

  it('clamps a full-bleed or oversized clip to the canvas', () => {
    const frame = selectionOverlayFrame(
      { ...DEFAULT_TRANSFORM, x: 960, y: 540, width: 2400, height: 1600 },
      0.5,
      1920,
      1080,
    )
    expect(frame).toEqual({ x: 1, y: 1, width: 958, height: 538, rotation: 0, clamped: true })
  })

  it('clamps a clip that hangs off the left edge', () => {
    const frame = selectionOverlayFrame(
      { ...DEFAULT_TRANSFORM, x: 0, y: 100, width: 200, height: 80 },
      1,
      1920,
      1080,
    )
    expect(frame).toMatchObject({ x: 1, y: 61, width: 98, height: 78, rotation: 0, clamped: true })
  })

  it('hides a clip that is completely off-canvas', () => {
    expect(selectionOverlayFrame(
      { ...DEFAULT_TRANSFORM, x: -400, y: -400, width: 80, height: 80 },
      1,
      1920,
      1080,
    )).toBeNull()
  })
})
