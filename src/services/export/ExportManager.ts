import type { EditorProject } from '@/types/editor'
import type { ExportOptions, ExportResult } from '@/types/export'
import { cloneProject } from '@/services/project/factory'
import { extensionFromMime, type VideoExporter } from '@/services/export/VideoExporter'
import { isAbortError, TaskRunner, type TaskSnapshot } from '@/services/task/TaskProgress'
import { sanitizeFileName } from '@/utils/format'

export class ExportManager {
  private readonly runner = new TaskRunner()

  constructor(private readonly exporters: VideoExporter[]) {}

  get snapshot(): TaskSnapshot {
    return this.runner.snapshot
  }

  subscribe(listener: (snapshot: TaskSnapshot) => void): () => void {
    return this.runner.subscribe(listener)
  }

  cancel(): void {
    this.runner.cancel()
  }

  selectExporters(options: ExportOptions): VideoExporter[] {
    return this.exporters.filter((exporter) => exporter.supports(options))
  }

  async run(project: EditorProject, options: ExportOptions, onProgress?: (snapshot: TaskSnapshot) => void): Promise<ExportResult> {
    const snapshot = cloneProject(project)
    const candidates = this.selectExporters(options)
    if (!candidates.length) throw new Error('当前浏览器不支持所选导出格式')
    const totalFrames = Math.max(1, options.endFrame - options.startFrame)
    const unsubscribe = onProgress ? this.runner.subscribe(onProgress) : () => undefined
    try {
      let used = candidates[0]
      const blob = await this.runner.run(options.fileName, totalFrames, async (ctx) => {
        let lastError: unknown
        for (const exporter of candidates) {
          try {
            used = exporter
            return await exporter.export(snapshot, options, {
              signal: ctx.signal,
              onProgress: (progress) => ctx.report({ current: progress.currentFrame, total: progress.totalFrames, message: progress.message }),
            })
          } catch (reason) {
            if (isAbortError(reason)) throw reason
            lastError = reason
          }
        }
        throw lastError instanceof Error ? lastError : new Error('导出失败')
      })
      const format = extensionFromMime(blob.type)
      const warnings: string[] = []
      if (options.format !== format) warnings.push(`当前浏览器无法稳定生成 ${options.format.toUpperCase()}，已改为 ${format.toUpperCase()}`)
      if (used.id !== 'webcodecs') warnings.push('已降级为 MediaRecorder 导出')
      return {
        blob,
        fileName: `${sanitizeFileName(options.fileName.replace(/\.(mp4|webm)$/i, ''))}.${format}`,
        mimeType: blob.type,
        durationFrames: totalFrames,
        width: options.width,
        height: options.height,
        fps: options.fps,
        format,
        exporterId: used.id,
        warnings,
      }
    } catch (reason) {
      if (isAbortError(reason)) throw reason
      throw reason instanceof Error ? reason : new Error('导出失败')
    } finally {
      unsubscribe()
    }
  }
}
