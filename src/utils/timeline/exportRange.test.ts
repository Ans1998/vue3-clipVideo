import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@/services/project/factory'
import { DEFAULT_TRANSFORM } from '@/types/editor'
import { exportContentRange, occupiedExportFrames, playbackContentRange, resampleOccupiedFrames, resolveExportTimeline } from '@/utils/timeline/exportRange'

function clip(id: string, trackId: string, startFrame: number, durationFrames: number, type: 'video' | 'text' | 'audio' = 'video') {
  return {
    id,
    trackId,
    type,
    materialId: 'mat',
    startFrame,
    durationFrames,
    offsetFrame: 0,
    name: id,
    zIndex: 0,
    locked: false,
    transform: { ...DEFAULT_TRANSFORM },
  }
}

describe('export content range', () => {
  it('uses visible track clips and skips empty timeline padding', () => {
    const project = createEmptyProject()
    project.settings.durationFrames = 900
    project.clips.push(clip('a', 'visual-1', 40, 80), clip('b', 'text-1', 200, 30))
    expect(exportContentRange(project)).toEqual({ startFrame: 40, endFrame: 230 })
    expect(occupiedExportFrames(project, 0, 900)).toEqual([
      ...Array.from({ length: 80 }, (_, index) => 40 + index),
      ...Array.from({ length: 30 }, (_, index) => 200 + index),
    ])
  })

  it('ignores hidden tracks so blank frames are not exported', () => {
    const project = createEmptyProject()
    project.tracks.find((track) => track.id === 'visual-1')!.hidden = true
    project.clips.push(clip('hidden', 'visual-1', 0, 120), clip('text', 'text-1', 10, 20, 'text'))
    expect(exportContentRange(project)).toEqual({ startFrame: 10, endFrame: 30 })
    expect(resolveExportTimeline(project, { startFrame: 0, endFrame: 900, fps: 30 })).toEqual(Array.from({ length: 20 }, (_, index) => 10 + index))
  })

  it('returns no frames when the timeline has no visible content', () => {
    const project = createEmptyProject()
    expect(exportContentRange(project)).toBeNull()
    expect(resolveExportTimeline(project, { startFrame: 0, endFrame: 900, fps: 30 })).toEqual([])
  })

  it('uses clip bounds as the playback window', () => {
    const project = createEmptyProject()
    project.settings.durationFrames = 900
    project.clips.push(clip('a', 'visual-1', 40, 80))
    expect(playbackContentRange(project)).toEqual({ startFrame: 40, endFrame: 120 })
    expect(playbackContentRange(createEmptyProject()).endFrame).toBe(900)
  })

  it('resamples occupied frames so a higher export fps keeps the same duration', () => {
    expect(resampleOccupiedFrames([10, 11, 12], 30, 60)).toEqual([10, 10, 11, 11, 12, 12])
    expect(resampleOccupiedFrames([10, 11, 12, 13], 60, 30)).toEqual([10, 12])
    const project = createEmptyProject()
    project.settings.fps = 30
    project.clips.push(clip('a', 'visual-1', 0, 30))
    expect(resolveExportTimeline(project, { startFrame: 0, endFrame: 30, fps: 60 })).toHaveLength(60)
    expect(resolveExportTimeline(project, { startFrame: 0, endFrame: 30, fps: 30 })).toHaveLength(30)
  })
})
