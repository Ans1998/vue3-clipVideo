import type { EditorProject, ProjectSettings, TimelineClip } from '@/types/editor'
import { trackWouldOverlap } from '@/utils/timeline/tracks'

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
  if (source != null) {
    offsetFrame = Math.min(offsetFrame, Math.max(0, source - 1))
    durationFrames = Math.min(durationFrames, Math.max(1, source - offsetFrame))
  }
  return { startFrame, durationFrames, offsetFrame }
}

export function trimLeftTo(project: EditorProject, clip: TimelineClip, requestedStart: number): Pick<TimelineClip, 'startFrame' | 'durationFrames' | 'offsetFrame'> {
  const source = sourceLength(project, clip)
  const maxStart = clip.startFrame + clip.durationFrames - 1
  if (source == null) {
    const startFrame = Math.min(maxStart, Math.max(0, Math.round(requestedStart)))
    return { startFrame, durationFrames: clip.startFrame + clip.durationFrames - startFrame, offsetFrame: 0 }
  }
  const minStart = Math.max(0, clip.startFrame - clip.offsetFrame)
  const startFrame = Math.min(maxStart, Math.max(minStart, Math.round(requestedStart)))
  const delta = startFrame - clip.startFrame
  return { startFrame, durationFrames: clip.durationFrames - delta, offsetFrame: clip.offsetFrame + delta }
}

export function trimRightTo(project: EditorProject, clip: TimelineClip, requestedEnd: number): Pick<TimelineClip, 'startFrame' | 'durationFrames' | 'offsetFrame'> {
  const source = sourceLength(project, clip)
  const minEnd = clip.startFrame + 1
  const maxEnd = source == null ? Number.POSITIVE_INFINITY : clip.startFrame + Math.max(1, source - clip.offsetFrame)
  const end = Math.min(maxEnd, Math.max(minEnd, Math.round(requestedEnd)))
  return { startFrame: clip.startFrame, durationFrames: end - clip.startFrame, offsetFrame: clip.offsetFrame }
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
