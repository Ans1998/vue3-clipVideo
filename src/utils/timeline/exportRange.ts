import type { EditorProject, TimelineClip } from '@/types/editor'
import type { ExportOptions } from '@/types/export'
import { clipEnd } from '@/utils/timeline/timing'
import { isTrackHidden } from '@/utils/timeline/tracks'

export function exportableClips(project: EditorProject): TimelineClip[] {
  return project.clips.filter((clip) => !isTrackHidden(project, clip.trackId))
}

export function exportContentRange(project: EditorProject): { startFrame: number; endFrame: number } | null {
  const clips = exportableClips(project)
  if (!clips.length) return null
  return {
    startFrame: Math.min(...clips.map((clip) => clip.startFrame)),
    endFrame: Math.max(...clips.map(clipEnd)),
  }
}

export function frameHasExportContent(project: EditorProject, frame: number): boolean {
  return exportableClips(project).some((clip) => frame >= clip.startFrame && frame < clip.startFrame + clip.durationFrames)
}

export function occupiedExportFrames(project: EditorProject, startFrame: number, endFrame: number): number[] {
  const frames: number[] = []
  const start = Math.max(0, Math.round(startFrame))
  const end = Math.max(start, Math.round(endFrame))
  for (let frame = start; frame < end; frame += 1) {
    if (frameHasExportContent(project, frame)) frames.push(frame)
  }
  return frames
}

export function resolveExportTimeline(project: EditorProject, options: Pick<ExportOptions, 'startFrame' | 'endFrame'>): number[] {
  const limit = Math.max(1, project.settings.durationFrames)
  const startFrame = Math.max(0, Math.min(options.startFrame, limit))
  const endFrame = Math.max(startFrame, Math.min(options.endFrame, limit))
  return occupiedExportFrames(project, startFrame, endFrame)
}

export function playbackContentRange(project: EditorProject): { startFrame: number; endFrame: number } {
  return exportContentRange(project) ?? { startFrame: 0, endFrame: Math.max(1, project.settings.durationFrames) }
}
