import type { EditorProject } from '@/types/editor'

export type CanvasPresetId = '16:9' | '9:16' | '1:1' | '4:3'

export interface CanvasPreset {
  id: CanvasPresetId
  label: string
  width: number
  height: number
}

export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { id: '16:9', label: '16:9', width: 1920, height: 1080 },
  { id: '9:16', label: '9:16', width: 1080, height: 1920 },
  { id: '1:1', label: '1:1', width: 1080, height: 1080 },
  { id: '4:3', label: '4:3', width: 1440, height: 1080 },
]

export function matchingCanvasPreset(width: number, height: number): CanvasPresetId | 'custom' {
  const exact = CANVAS_PRESETS.find((item) => item.width === width && item.height === height)
  if (exact) return exact.id
  const ratio = width / height
  const close = CANVAS_PRESETS.find((item) => Math.abs(ratio - item.width / item.height) < 0.02)
  return close?.id ?? 'custom'
}

export function applyCanvasSize(project: EditorProject, width: number, height: number): boolean {
  const nextWidth = Math.max(16, Math.round(width))
  const nextHeight = Math.max(16, Math.round(height))
  if (project.settings.width === nextWidth && project.settings.height === nextHeight) return false
  const dx = nextWidth / 2 - project.settings.width / 2
  const dy = nextHeight / 2 - project.settings.height / 2
  project.clips.forEach((clip) => {
    clip.transform.x = Math.round(clip.transform.x + dx)
    clip.transform.y = Math.round(clip.transform.y + dy)
  })
  project.settings.width = nextWidth
  project.settings.height = nextHeight
  return true
}

export function fitCanvasZoom(viewWidth: number, viewHeight: number, canvasWidth: number, canvasHeight: number, padding = 80, maxZoom = 0.72): number {
  if (viewWidth <= padding || viewHeight <= padding || canvasWidth <= 0 || canvasHeight <= 0) return 0.4
  const fitted = Math.min((viewWidth - padding) / canvasWidth, (viewHeight - padding) / canvasHeight)
  return Math.min(maxZoom, Math.max(0.08, fitted))
}
