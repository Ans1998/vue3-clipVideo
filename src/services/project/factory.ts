import { nanoid } from 'nanoid'
import type { EditorProject, TimelineTrack, TrackType } from '@/types/editor'
import { toTrackType, TYPE_LABEL } from '@/utils/timeline/tracks'

export const DEFAULT_TRACKS: TimelineTrack[] = [
  { id: 'visual-1', name: '画面轨 1', type: 'visual', order: 0, locked: false, hidden: false, muted: false },
  { id: 'text-1', name: '文字轨 1', type: 'text', order: 1, locked: false, hidden: false, muted: false },
  { id: 'audio-1', name: '音频轨 1', type: 'audio', order: 2, locked: false, hidden: false, muted: false },
]

export function createEmptyProject(name = '未命名项目'): EditorProject {
  const now = Date.now()
  return {
    id: nanoid(),
    name,
    settings: { width: 1920, height: 1080, fps: 30, durationFrames: 900 },
    materials: [],
    tracks: structuredClone(DEFAULT_TRACKS),
    clips: [],
    currentFrame: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function serializeProject(project: EditorProject): EditorProject {
  return JSON.parse(JSON.stringify({
    ...project,
    materials: project.materials.map(({ objectUrl: _url, ...item }) => item),
  })) as EditorProject
}

export function cloneProject(project: EditorProject): EditorProject {
  return JSON.parse(JSON.stringify(project)) as EditorProject
}

export function normalizeProject(project: EditorProject): EditorProject {
  const counts: Record<TrackType, number> = { visual: 0, text: 0, audio: 0 }
  project.tracks.forEach((track) => {
    const raw = track.type as string
    if (raw === 'video' || raw === 'image') {
      track.type = 'visual'
      track.name = track.name.replace('视频轨', '画面轨').replace('图片轨', '画面轨')
    } else {
      track.type = toTrackType(track.type)
    }
    if (typeof track.hidden !== 'boolean') track.hidden = false
    if (typeof track.muted !== 'boolean') track.muted = false
  })
  ;[...project.tracks].sort((left, right) => left.order - right.order).forEach((track) => {
    counts[track.type] += 1
    if (/^(画面轨|视频轨|图片轨|文字轨|音频轨)\s+\d+$/.test(track.name)) {
      track.name = `${TYPE_LABEL[track.type]} ${counts[track.type]}`
    }
  })
  return project
}
