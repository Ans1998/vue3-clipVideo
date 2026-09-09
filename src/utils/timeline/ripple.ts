import type { EditorProject, TimelineClip } from '@/types/editor'

export function rippleShift(project: EditorProject, trackId: string, fromFrame: number, delta: number, ignoreIds: string[] = []): void {
  if (!delta) return
  project.clips.forEach((clip) => {
    if (clip.trackId !== trackId || ignoreIds.includes(clip.id) || clip.startFrame < fromFrame) return
    clip.startFrame = Math.max(0, clip.startFrame + delta)
  })
}

export function rippleRemove(project: EditorProject, clips: TimelineClip[]): void {
  const ids = new Set(clips.map((clip) => clip.id))
  const groups = new Map<string, TimelineClip[]>()
  clips.forEach((clip) => {
    const list = groups.get(clip.trackId) ?? []
    list.push(clip)
    groups.set(clip.trackId, list)
  })
  groups.forEach((group, trackId) => {
    [...group].sort((left, right) => right.startFrame - left.startFrame).forEach((clip) => {
      rippleShift(project, trackId, clip.startFrame + clip.durationFrames, -clip.durationFrames, [...ids])
    })
  })
  project.clips = project.clips.filter((clip) => !ids.has(clip.id))
}
