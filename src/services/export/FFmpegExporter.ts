import type { EditorProject } from '@/types/editor'
import type { ExportOptions } from '@/types/export'
import type { ExportHandlers, VideoExporter } from '@/services/export/VideoExporter'

export class FFmpegExporter implements VideoExporter {
  readonly id = 'ffmpeg'
  readonly label = 'FFmpeg (Electron)'

  supports(_options: ExportOptions): boolean {
    return false
  }

  async export(_project: EditorProject, _options: ExportOptions, _handlers?: ExportHandlers): Promise<Blob> {
    throw new Error('FFmpeg 导出将在 Electron 版本中启用，浏览器阶段请使用 WebM / 浏览器录制')
  }
}
