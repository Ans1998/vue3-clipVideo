export type MaterialType = 'video' | 'image' | 'audio'
export type ClipType = MaterialType | 'text'
export type TrackType = 'visual' | 'text' | 'audio'

export interface Transform {
  x: number
  y: number
  width: number
  height: number
  scaleX: number
  scaleY: number
  rotation: number
  opacity: number
}

export interface TextConfig {
  content: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  color: string
  align: CanvasTextAlign
  lineHeight: number
  letterSpacing: number
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
}

export interface AudioConfig {
  volume: number
  muted: boolean
}

export interface Material {
  id: string
  type: MaterialType
  name: string
  mimeType: string
  size: number
  durationFrames?: number
  width?: number
  height?: number
  objectUrl?: string
  missing?: boolean
}

export interface TimelineTrack {
  id: string
  name: string
  type: TrackType
  order: number
  locked: boolean
  hidden: boolean
  muted: boolean
}

export interface TimelineClip {
  id: string
  trackId: string
  type: ClipType
  materialId?: string
  startFrame: number
  durationFrames: number
  offsetFrame: number
  name: string
  zIndex: number
  locked: boolean
  transform: Transform
  text?: TextConfig
  audio?: AudioConfig
}

export interface ProjectSettings {
  width: number
  height: number
  fps: 24 | 25 | 30 | 50 | 60
  durationFrames: number
}

export interface EditorProject {
  id: string
  name: string
  settings: ProjectSettings
  materials: Material[]
  tracks: TimelineTrack[]
  clips: TimelineClip[]
  currentFrame: number
  createdAt: number
  updatedAt: number
}

export const DEFAULT_AUDIO: AudioConfig = { volume: 1, muted: false }

export const DEFAULT_TRANSFORM: Transform = {
  x: 960,
  y: 540,
  width: 960,
  height: 540,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
}

export function createDefaultText(content = '文字'): TextConfig {
  return {
    content,
    fontFamily: 'Microsoft YaHei',
    fontSize: 72,
    fontWeight: 700,
    color: '#ffffff',
    align: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
    italic: false,
    underline: false,
    strikethrough: false,
  }
}
