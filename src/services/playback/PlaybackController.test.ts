import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlaybackController } from '@/services/playback/PlaybackController'

function createTarget(frame: number, startFrame = 0, endFrame = 10) {
  const state = { frame }
  return {
    state,
    target: {
      fps: () => 30,
      currentFrame: () => state.frame,
      startFrame: () => startFrame,
      durationFrames: () => endFrame,
      setCurrentFrame: (value: number) => { state.frame = value },
    },
  }
}

describe('PlaybackController', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rewinds to content start when play is pressed at the last content frame', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    const { state, target } = createTarget(9, 3, 10)
    const controller = new PlaybackController(target)
    controller.play()
    expect(state.frame).toBe(3)
    controller.pause()
  })

  it('stops at the last content frame instead of walking into empty timeline', () => {
    const callbacks: FrameRequestCallback[] = []
    vi.stubGlobal('performance', { now: () => 0 })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => { callbacks.length = 0 })
    const { state, target } = createTarget(8, 0, 10)
    const controller = new PlaybackController(target)
    controller.play()
    expect(controller.isPlaying).toBe(true)
    callbacks[0]?.(1000)
    expect(state.frame).toBe(9)
    expect(controller.isPlaying).toBe(false)
  })
})
