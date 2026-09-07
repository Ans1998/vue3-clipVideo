export type ExportFormat = 'mp4' | 'webm'
export type ExportQuality = 'standard' | 'hd' | 'high'
export type ExportRangeMode = 'all' | 'clip' | 'custom'
export type ExportResolutionPreset = 'project' | '1920x1080' | '1280x720' | '1080x1920' | 'custom'

export interface ExportOptions {
  fileName: string
  format: ExportFormat
  width: number
  height: number
  fps: 24 | 25 | 30 | 50 | 60
  quality: ExportQuality
  startFrame: number
  endFrame: number
}

export interface ExportProgress {
  currentFrame: number
  totalFrames: number
  percent: number
  elapsedMs: number
  remainingMs: number | null
  message: string
}

export interface ExportResult {
  blob: Blob
  fileName: string
  mimeType: string
  durationFrames: number
  width: number
  height: number
  fps: number
  format: ExportFormat
  exporterId: string
  warnings: string[]
  savedToDirectory?: boolean
}

export interface ExportCapabilities {
  webm: boolean
  mp4: boolean
  webCodecs: boolean
  mediaRecorder: boolean
}

export const RESOLUTION_PRESETS: ReadonlyArray<{ id: ExportResolutionPreset; label: string; width?: number; height?: number }> = [
  { id: 'project', label: '项目原始分辨率' },
  { id: '1920x1080', label: '1920×1080', width: 1920, height: 1080 },
  { id: '1280x720', label: '1280×720', width: 1280, height: 720 },
  { id: '1080x1920', label: '1080×1920', width: 1080, height: 1920 },
  { id: 'custom', label: '自定义' },
]

export const EXPORT_FPS_OPTIONS = [24, 25, 30, 50, 60] as const

export const QUALITY_LABELS: Record<ExportQuality, string> = {
  standard: '标准',
  hd: '高清',
  high: '高质量',
}
