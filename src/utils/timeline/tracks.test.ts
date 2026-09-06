import { describe, expect, it } from 'vitest'
import { createEmptyProject, normalizeProject } from '@/services/project/factory'
import { DEFAULT_TRANSFORM } from '@/types/editor'
import { canDetachAudio, canRemoveTrack, createTrack, effectiveClipGain, resolveTrackDrop, RULER_ROW, TRACK_ROW, trackWouldOverlap } from '@/utils/timeline/tracks'

describe('track drop', () => {
  it('creates extra visual tracks for video and image', () => {
    const project = createEmptyProject()
    const video = createTrack(project, 'video')
    const image = createTrack(project, 'image')
    const text = createTrack(project, 'text')
    const audio = createTrack(project, 'audio')
    expect(project.tracks.filter((track) => track.type === 'visual')).toHaveLength(3)
    expect([video.type, image.type, text.type, audio.type]).toEqual(['visual', 'visual', 'text', 'audio'])
  })

  it('lets video and image land on the same visual track', () => {
    const project = createEmptyProject()
    const tracks = [...project.tracks].sort((left, right) => left.order - right.order)
    expect(resolveTrackDrop(RULER_ROW + TRACK_ROW / 2, tracks, 'video').kind).toBe('onto')
    expect(resolveTrackDrop(RULER_ROW + TRACK_ROW / 2, tracks, 'image').kind).toBe('onto')
    expect(resolveTrackDrop(RULER_ROW + 2, tracks, 'video').kind).toBe('insert')
    expect(resolveTrackDrop(RULER_ROW + tracks.length * TRACK_ROW + 8, tracks, 'text')).toEqual({ kind: 'new' })
    expect(resolveTrackDrop(RULER_ROW + TRACK_ROW / 2, tracks, 'audio').kind).toBe('insert')
  })

  it('detects overlap so a drop can spawn another lane', () => {
    const project = createEmptyProject()
    project.clips.push({
      id: 'a', trackId: 'visual-1', type: 'video', startFrame: 0, durationFrames: 40, offsetFrame: 0, name: 'a', zIndex: 0, locked: false, transform: { ...DEFAULT_TRANSFORM },
    })
    expect(trackWouldOverlap(project, 'visual-1', [{ startFrame: 10, durationFrames: 20 }], ['b'])).toBe(true)
    expect(trackWouldOverlap(project, 'visual-1', [{ startFrame: 50, durationFrames: 10 }], [])).toBe(false)
    expect(canRemoveTrack(project, 'visual-1')).toBe(false)
    createTrack(project, 'visual')
    const extra = project.tracks.find((track) => track.type === 'visual' && track.id !== 'visual-1')!
    expect(canRemoveTrack(project, extra.id)).toBe(true)
  })

  it('migrates legacy video/image tracks into visual tracks', () => {
    const project = createEmptyProject()
    project.tracks = [
      { id: 'video-1', name: '视频轨 1', type: 'video' as never, order: 0, locked: false, hidden: undefined as never, muted: undefined as never },
      { id: 'image-1', name: '图片轨 1', type: 'image' as never, order: 1, locked: false, hidden: false, muted: false },
    ]
    normalizeProject(project)
    expect(project.tracks.map((track) => track.type)).toEqual(['visual', 'visual'])
    expect(project.tracks[0].name).toBe('画面轨 1')
    expect(project.tracks[1].name).toBe('画面轨 2')
    expect(project.tracks[0].hidden).toBe(false)
    expect(project.tracks[0].muted).toBe(false)
  })

  it('detaches video audio only once and respects track mute', () => {
    const project = createEmptyProject()
    const clip = {
      id: 'v', trackId: 'visual-1', type: 'video' as const, materialId: 'mat', startFrame: 10, durationFrames: 40, offsetFrame: 2, name: 'shot', zIndex: 0, locked: false, transform: { ...DEFAULT_TRANSFORM }, audio: { volume: 0.8, muted: false },
    }
    project.clips.push(clip)
    expect(canDetachAudio(project, clip)).toBe(true)
    project.clips.push({
      id: 'a', trackId: 'audio-1', type: 'audio', materialId: 'mat', startFrame: 10, durationFrames: 40, offsetFrame: 2, name: 'shot audio', zIndex: 1, locked: false, transform: { ...DEFAULT_TRANSFORM }, audio: { volume: 0.8, muted: false },
    })
    expect(canDetachAudio(project, clip)).toBe(false)
    expect(effectiveClipGain(project, 'v')).toBe(0.8)
    project.tracks.find((track) => track.id === 'visual-1')!.muted = true
    expect(effectiveClipGain(project, 'v')).toBe(0)
    project.tracks.find((track) => track.id === 'visual-1')!.muted = false
    project.tracks.find((track) => track.id === 'visual-1')!.hidden = true
    expect(effectiveClipGain(project, 'v')).toBe(0)
  })
})
