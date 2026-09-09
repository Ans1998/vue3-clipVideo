import type { EditorProject, ProjectSettings, TimelineClip } from '@/types/editor'
import { trackWouldOverlap } from '@/utils/timeline/tracks'
import { clipSpeed } from '@/utils/timeline/clipPlayback'

export const MIN_PIXELS_PER_FRAME = 0.25
export const MAX_PIXELS_PER_FRAME = 24

export function clipEnd(clip: Pick<TimelineClip, 'startFrame' | 'durationFrames'>): number {
  return clip.startFrame + clip.durationFrames
}

export function contentEndFrame(project: Pick<EditorProject, 'clips'>): number {
  if (!project.clips.length) return 0
  return Math.max(0, ...project.clips.map(clipEnd))
}

export function sourceLength(project: Pick<EditorProject, 'materials'>, clip: Pick<TimelineClip, 'type' | 'materialId'>): number | null {
  if (clip.type !== 'video' && clip.type !== 'audio') return null
  const material = project.materials.find((item) => item.id === clip.materialId)
  return material?.durationFrames ?? null
}

export function timelinePadding(fps: number): number {
  return Math.max(1, fps)
}

export function requiredDurationFrames(project: EditorProject, padding = timelinePadding(project.settings.fps)): number {
  return Math.max(project.settings.fps, contentEndFrame(project) + padding)
}

export function ensureDurationFrames(project: EditorProject): boolean {
  const needed = requiredDurationFrames(project)
  if (project.settings.durationFrames >= needed) return false
  project.settings.durationFrames = needed
  return true
}

export function clampDurationFrames(project: EditorProject, frames: number): number {
  const content = Math.max(project.settings.fps, contentEndFrame(project))
  return Math.max(content, Math.round(frames))
}

export function clampClipTiming(
  project: EditorProject,
  clip: TimelineClip,
  patch: Partial<Pick<TimelineClip, 'startFrame' | 'durationFrames' | 'offsetFrame'>>,
): Pick<TimelineClip, 'startFrame' | 'durationFrames' | 'offsetFrame'> {
  let startFrame = Math.max(0, Math.round(patch.startFrame ?? clip.startFrame))
  let durationFrames = Math.max(1, Math.round(patch.durationFrames ?? clip.durationFrames))
  let offsetFrame = Math.max(0, Math.round(patch.offsetFrame ?? clip.offsetFrame))
  const source = sourceLength(project, clip)
  const speed = clipSpeed(clip)
  if (source != null) {
    offsetFrame = Math.min(offsetFrame, Math.max(0, source - 1))
    durationFrames = Math.min(durationFrames, Math.max(1, Math.floor((source - offsetFrame) / speed)))
  }
  const fitted = fitRangeOnTrack(project, clip.id, clip.trackId, startFrame, durationFrames)
  return { startFrame: fitted.startFrame, durationFrames: fitted.durationFrames, offsetFrame }
}

export function fitRangeOnTrack(
  project: EditorProject,
  clipId: string,
  trackId: string,
  startFrame: number,
  durationFrames: number,
): { startFrame: number; durationFrames: number } {
  let start = Math.max(0, startFrame)
  let duration = Math.max(1, durationFrames)
  if (!trackWouldOverlap(project, trackId, [{ startFrame: start, durationFrames: duration }], [clipId])) {
    return { startFrame: start, durationFrames: duration }
  }
  const original = project.clips.find((item) => item.id === clipId)
  const others = project.clips.filter((item) => item.trackId === trackId && item.id !== clipId)
  const originalStart = original?.startFrame ?? start
  const originalEnd = original ? clipEnd(original) : start + duration
  const previousEnds = others.filter((item) => clipEnd(item) <= originalStart).map(clipEnd)
  const nextStarts = others.filter((item) => item.startFrame >= originalEnd).map((item) => item.startFrame)
  const minStart = previousEnds.length ? Math.max(0, ...previousEnds) : 0
  const maxEnd = nextStarts.length ? Math.min(...nextStarts) : Number.POSITIVE_INFINITY
  start = Math.max(start, minStart)
  if (Number.isFinite(maxEnd)) start = Math.min(start, Math.max(minStart, maxEnd - 1))
  duration = Math.max(1, Math.min(duration, (Number.isFinite(maxEnd) ? maxEnd : start + duration) - start))
  if (trackWouldOverlap(project, trackId, [{ startFrame: start, durationFrames: duration }], [clipId]) && original) {
    return { startFrame: original.startFrame, durationFrames: original.durationFrames }
  }
  return { startFrame: start, durationFrames: duration }
}

export function trimLeftTo(project: EditorProject, clip: TimelineClip, requestedStart: number): Pick<TimelineClip, 'startFrame' | 'durationFrames' | 'offsetFrame'> {
  const source = sourceLength(project, clip)
  const speed = clipSpeed(clip)
  const maxStart = clip.startFrame + clip.durationFrames - 1
  let startFrame: number
  let durationFrames: number
  let offsetFrame: number
  if (source == null) {
    startFrame = Math.min(maxStart, Math.max(0, Math.round(requestedStart)))
    durationFrames = clip.startFrame + clip.durationFrames - startFrame
    offsetFrame = 0
  } else {
    const minStart = Math.max(0, clip.startFrame - Math.floor(clip.offsetFrame / speed))
    startFrame = Math.min(maxStart, Math.max(minStart, Math.round(requestedStart)))
    const delta = startFrame - clip.startFrame
    durationFrames = clip.durationFrames - delta
    offsetFrame = clip.offsetFrame + Math.round(delta * speed)
  }
  const fitted = fitRangeOnTrack(project, clip.id, clip.trackId, startFrame, durationFrames)
  const originalEnd = clip.startFrame + clip.durationFrames
  const fittedDelta = fitted.startFrame - clip.startFrame
  return {
    startFrame: fitted.startFrame,
    durationFrames: Math.max(1, Math.min(fitted.durationFrames, originalEnd - fitted.startFrame)),
    offsetFrame: source == null ? 0 : clip.offsetFrame + Math.round(fittedDelta * speed),
  }
}

export function trimRightTo(project: EditorProject, clip: TimelineClip, requestedEnd: number): Pick<TimelineClip, 'startFrame' | 'durationFrames' | 'offsetFrame'> {
  const source = sourceLength(project, clip)
  const minEnd = clip.startFrame + 1
  const maxEnd = source == null ? Number.POSITIVE_INFINITY : clip.startFrame + Math.max(1, Math.floor((source - clip.offsetFrame) / clipSpeed(clip)))
  const end = Math.min(maxEnd, Math.max(minEnd, Math.round(requestedEnd)))
  const fitted = fitRangeOnTrack(project, clip.id, clip.trackId, clip.startFrame, end - clip.startFrame)
  return { startFrame: fitted.startFrame, durationFrames: fitted.durationFrames, offsetFrame: clip.offsetFrame }
}

export function limitedMoveDelta(
  project: EditorProject,
  clips: Array<Pick<TimelineClip, 'id' | 'trackId' | 'startFrame' | 'durationFrames'>>,
  delta: number,
): number {
  if (!clips.length) return 0
  const ignore = clips.map((clip) => clip.id)
  const minStart = Math.min(...clips.map((clip) => clip.startFrame))
  let next = Math.max(-minStart, Math.round(delta))
  const overlaps = (value: number): boolean => clips.some((clip) => {
    const startFrame = clip.startFrame + value
    if (startFrame < 0) return true
    return trackWouldOverlap(project, clip.trackId, [{ startFrame, durationFrames: clip.durationFrames }], ignore)
  })
  if (!overlaps(next)) return next
  let best = 0
  let low = next < 0 ? next : 0
  let high = next < 0 ? 0 : next
  while (low <= high) {
    const mid = Math.trunc((low + high) / 2)
    if (overlaps(mid)) {
      if (next > 0) high = mid - 1
      else low = mid + 1
    } else {
      best = mid
      if (next > 0) low = mid + 1
      else high = mid - 1
    }
  }
  return best
}

export function scaleFrames(value: number, fromFps: number, toFps: number): number {
  return Math.max(0, Math.round(value * toFps / fromFps))
}

export function rescaleProjectFps(project: EditorProject, fps: ProjectSettings['fps']): void {
  if (project.settings.fps === fps) return
  const from = project.settings.fps
  const scale = (value: number) => scaleFrames(value, from, fps)
  project.clips.forEach((clip) => {
    clip.startFrame = scale(clip.startFrame)
    clip.durationFrames = Math.max(1, scale(clip.durationFrames))
    clip.offsetFrame = scale(clip.offsetFrame)
    clip.fadeInFrames = scale(clip.fadeInFrames ?? 0)
    clip.fadeOutFrames = scale(clip.fadeOutFrames ?? 0)
    if (clip.transitionIn) clip.transitionIn.durationFrames = scale(clip.transitionIn.durationFrames)
    if (clip.transitionOut) clip.transitionOut.durationFrames = scale(clip.transitionOut.durationFrames)
    if (clip.audio) {
      clip.audio.fadeInFrames = scale(clip.audio.fadeInFrames ?? 0)
      clip.audio.fadeOutFrames = scale(clip.audio.fadeOutFrames ?? 0)
    }
  })
  project.materials.forEach((material) => {
    if (material.durationFrames) material.durationFrames = Math.max(1, scale(material.durationFrames))
  })
  project.currentFrame = scale(project.currentFrame)
  project.settings.durationFrames = Math.max(fps, scale(project.settings.durationFrames))
  project.settings.fps = fps
}

export function zoomPixelsPerFrame(current: number, direction: 1 | -1): number {
  const next = direction > 0 ? current * 1.25 : current / 1.25
  return Math.min(MAX_PIXELS_PER_FRAME, Math.max(MIN_PIXELS_PER_FRAME, Number(next.toFixed(2))))
}

export function fitPixelsPerFrame(viewWidth: number, durationFrames: number): number {
  if (durationFrames <= 0 || viewWidth <= 0) return 4
  return Math.min(MAX_PIXELS_PER_FRAME, Math.max(MIN_PIXELS_PER_FRAME, Number(((viewWidth - 24) / durationFrames).toFixed(3))))
}
