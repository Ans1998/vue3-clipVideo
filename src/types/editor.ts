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
  fadeInFrames?: number
  fadeOutFrames?: number
}

export type ClipTransitionKind = 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom'

export interface ClipTransition {
  kind: ClipTransitionKind
  durationFrames: number
}

export interface ClipFilter {
  brightness: number
  contrast: number
  saturation: number
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
  speed?: number
  fadeInFrames?: number
  fadeOutFrames?: number
  transitionIn?: ClipTransition
  transitionOut?: ClipTransition
  filter?: ClipFilter
  text?: TextConfig
  audio?: AudioConfig
}

export interface ProjectSettings {
  width: number
  height: number
  fps: 24 | 25 | 30 | 50 | 60
  durationFrames: number
  rippleEdit?: boolean
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

export const DEFAULT_AUDIO: AudioConfig = { volume: 1, muted: false, fadeInFrames: 0, fadeOutFrames: 0 }

export const DEFAULT_FILTER: ClipFilter = { brightness: 1, contrast: 1, saturation: 1 }

export const CLIP_SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const

export const DEFAULT_TRANSITION: ClipTransition = { kind: 'none', durationFrames: 12 }

export const CLIP_TRANSITION_IN = [
  { id: 'none', label: '无' },
  { id: 'fade', label: '淡入' },
  { id: 'slide-left', label: '左进' },
  { id: 'slide-right', label: '右进' },
  { id: 'slide-up', label: '上进' },
  { id: 'slide-down', label: '下进' },
  { id: 'zoom', label: '放大' },
] as const satisfies ReadonlyArray<{ id: ClipTransitionKind; label: string }>

export const CLIP_TRANSITION_OUT = [
  { id: 'none', label: '无' },
  { id: 'fade', label: '淡出' },
  { id: 'slide-left', label: '左出' },
  { id: 'slide-right', label: '右出' },
  { id: 'slide-up', label: '上出' },
  { id: 'slide-down', label: '下出' },
  { id: 'zoom', label: '缩小' },
] as const satisfies ReadonlyArray<{ id: ClipTransitionKind; label: string }>

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
