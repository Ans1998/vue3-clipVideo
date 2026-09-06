import { nanoid } from 'nanoid'
import type { ClipType, EditorProject, TimelineClip, TimelineTrack, TrackType } from '@/types/editor'

export const RULER_ROW = 36
export const TRACK_ROW = 36
export const TRACK_EDGE = 10

export const TYPE_LABEL: Record<TrackType, string> = { visual: '画面轨', text: '文字轨', audio: '音频轨' }
export const TYPE_SHORT: Record<TrackType, string> = { visual: '画', text: '文', audio: '音' }

export type TrackDropHint =
  | { kind: 'onto'; trackId: string }
  | { kind: 'insert'; afterOrder: number; index: number }
  | { kind: 'new' }
  | { kind: 'blocked' }

export function toTrackType(type: ClipType | TrackType | string): TrackType {
  if (type === 'audio' || type === 'text') return type
  return 'visual'
}

export function trackAccepts(track: TimelineTrack, clipType: ClipType): boolean {
  return track.type === toTrackType(clipType)
}

export function sortedTracks(project: EditorProject): TimelineTrack[] {
  return [...project.tracks].sort((left, right) => left.order - right.order)
}

export function createTrack(project: EditorProject, type: ClipType | TrackType, afterOrder?: number): TimelineTrack {
  const trackType = toTrackType(type)
  const sameType = project.tracks.filter((track) => track.type === trackType).length + 1
  const order = afterOrder === undefined ? project.tracks.length : afterOrder + 1
  project.tracks.forEach((track) => { if (track.order >= order) track.order += 1 })
  const track: TimelineTrack = { id: nanoid(), name: `${TYPE_LABEL[trackType]} ${sameType}`, type: trackType, order, locked: false, hidden: false, muted: false }
  project.tracks.push(track)
  return track
}

export function findTrack(project: EditorProject, trackId?: string): TimelineTrack | undefined {
  return project.tracks.find((item) => item.id === trackId)
}

export function isClipInteractable(project: EditorProject, clipId: string): boolean {
  const clip = project.clips.find((item) => item.id === clipId)
  if (!clip || clip.locked) return false
  return !findTrack(project, clip.trackId)?.locked
}

export function isTrackHidden(project: EditorProject, trackId?: string): boolean {
  return Boolean(findTrack(project, trackId)?.hidden)
}

export function effectiveClipGain(project: EditorProject, clipId: string): number {
  const clip = project.clips.find((item) => item.id === clipId)
  if (!clip) return 0
  const track = findTrack(project, clip.trackId)
  if (track?.muted || track?.hidden) return 0
  if (clip.audio?.muted) return 0
  return clip.audio?.volume ?? 1
}

export function visibleClips(project: EditorProject, trackId: string, startFrame: number, endFrame: number) {
  return project.clips.filter((clip) => clip.trackId === trackId && clip.startFrame < endFrame && clip.startFrame + clip.durationFrames > startFrame)
}

export function rangesOverlap(left: { startFrame: number; durationFrames: number }, right: { startFrame: number; durationFrames: number }): boolean {
  return left.startFrame < right.startFrame + right.durationFrames && right.startFrame < left.startFrame + left.durationFrames
}

export function trackWouldOverlap(project: EditorProject, trackId: string, ranges: Array<{ startFrame: number; durationFrames: number }>, ignoreIds: string[] = []): boolean {
  const others = project.clips.filter((clip) => clip.trackId === trackId && !ignoreIds.includes(clip.id))
  return ranges.some((range) => others.some((clip) => rangesOverlap(range, clip)))
}

export function canRemoveTrack(project: EditorProject, trackId: string): boolean {
  const track = findTrack(project, trackId)
  if (!track) return false
  if (project.clips.some((clip) => clip.trackId === trackId)) return false
  return project.tracks.filter((item) => item.type === track.type).length > 1
}

export function resolveTrackDrop(canvasY: number, tracks: TimelineTrack[], type: ClipType): TrackDropHint {
  const rows = [...tracks].sort((left, right) => left.order - right.order)
  const y = Math.max(0, canvasY - RULER_ROW)
  if (!rows.length || y >= rows.length * TRACK_ROW - 4) return { kind: 'new' }
  const index = Math.min(rows.length - 1, Math.floor(y / TRACK_ROW))
  const offset = y - index * TRACK_ROW
  const track = rows[index]
  if (offset < TRACK_EDGE) return { kind: 'insert', afterOrder: track.order - 1, index }
  if (offset > TRACK_ROW - TRACK_EDGE) return { kind: 'insert', afterOrder: track.order, index: index + 1 }
  if (track.locked) return { kind: 'blocked' }
  if (trackAccepts(track, type)) return { kind: 'onto', trackId: track.id }
  return { kind: 'insert', afterOrder: track.order, index: index + 1 }
}

export function movingClips(project: EditorProject, ids: string[], type: ClipType): TimelineClip[] {
  return project.clips.filter((clip) => ids.includes(clip.id) && clip.type === type && isClipInteractable(project, clip.id))
}

export function canDetachAudio(project: EditorProject, clip: TimelineClip): boolean {
  if (clip.type !== 'video' || !clip.materialId || clip.locked) return false
  if (findTrack(project, clip.trackId)?.locked) return false
  return !project.clips.some((item) => (
    item.type === 'audio'
    && item.materialId === clip.materialId
    && item.startFrame === clip.startFrame
    && item.offsetFrame === clip.offsetFrame
    && item.durationFrames === clip.durationFrames
  ))
}
