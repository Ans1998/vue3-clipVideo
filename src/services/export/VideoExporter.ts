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

const WEBM_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
const MP4_TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.4D0028,mp4a.40.2',
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1.4D0028',
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
]

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

export function pickRecorderMimeType(format: ExportFormat, withAudio = false): string | undefined {
  const preferred = format === 'mp4' ? [...MP4_TYPES, ...WEBM_TYPES] : [...WEBM_TYPES, ...MP4_TYPES]
  if (withAudio) {
    const withSound = preferred.filter((type) => /opus|mp4a/i.test(type))
    return supportedType(withSound) ?? supportedType(preferred)
  }
  return supportedType(preferred)
}

export function extensionFromMime(mimeType: string): ExportFormat {
  return mimeType.includes('mp4') ? 'mp4' : 'webm'
}

export function qualityBitrate(quality: ExportOptions['quality']): number {
  if (quality === 'standard') return 3_000_000
  if (quality === 'hd') return 8_000_000
  return 16_000_000
}
