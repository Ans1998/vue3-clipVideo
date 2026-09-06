import type { EditorProject } from '@/types/editor'
import type { ExportCapabilities, ExportFormat, ExportOptions, ExportProgress } from '@/types/export'

export interface ExportHandlers {
  signal?: AbortSignal
  onProgress?: (progress: ExportProgress) => void
}

export interface VideoExporter {
  readonly id: string
  readonly label: string
  supports(options: ExportOptions): boolean
  export(project: EditorProject, options: ExportOptions, handlers?: ExportHandlers): Promise<Blob>
}

const WEBM_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
const MP4_TYPES = ['video/mp4;codecs=avc1.42001E', 'video/mp4;codecs=avc1.42E01E', 'video/mp4']

function supportedType(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return candidates.find((type) => MediaRecorder.isTypeSupported(type))
}

export function detectExportCapabilities(): ExportCapabilities {
  return {
    mediaRecorder: typeof MediaRecorder !== 'undefined',
    webm: Boolean(supportedType(WEBM_TYPES)),
    mp4: Boolean(supportedType(MP4_TYPES)),
    webCodecs: typeof globalThis !== 'undefined' && 'VideoEncoder' in globalThis,
  }
}

export function pickRecorderMimeType(format: ExportFormat): string | undefined {
  return format === 'mp4' ? supportedType(MP4_TYPES) ?? supportedType(WEBM_TYPES) : supportedType(WEBM_TYPES) ?? supportedType(MP4_TYPES)
}

export function extensionFromMime(mimeType: string): ExportFormat {
  return mimeType.includes('mp4') ? 'mp4' : 'webm'
}

export function qualityBitrate(quality: ExportOptions['quality']): number {
  if (quality === 'standard') return 3_000_000
  if (quality === 'hd') return 8_000_000
  return 16_000_000
}
