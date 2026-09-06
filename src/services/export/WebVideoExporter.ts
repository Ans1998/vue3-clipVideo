import type { EditorProject } from '@/types/editor'
import type { ExportOptions } from '@/types/export'
import { abortError } from '@/services/task/TaskProgress'
import { CanvasSceneRenderer } from '@/services/renderer/SceneRenderer'
import { MaterialAssetLoader } from '@/services/renderer/MaterialAssetLoader'
import { containRect } from '@/utils/format'
import { pickRecorderMimeType, qualityBitrate, type ExportHandlers, type VideoExporter } from '@/services/export/VideoExporter'

function createRecorder(stream: MediaStream, mimeType: string, bitrate: number): MediaRecorder {
  try { return new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate }) }
  catch { return new MediaRecorder(stream, { mimeType }) }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return }
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { window.clearTimeout(timer); reject(abortError()) }, { once: true })
  })
}

export class WebVideoExporter implements VideoExporter {
  readonly id = 'web-mediacapture'
  readonly label = 'Browser MediaRecorder / WebCodecs'

  supports(options: ExportOptions): boolean {
    return Boolean(pickRecorderMimeType(options.format))
  }

  async export(project: EditorProject, options: ExportOptions, handlers: ExportHandlers = {}): Promise<Blob> {
    const signal = handlers.signal ?? new AbortController().signal
    const mimeType = pickRecorderMimeType(options.format)
    if (!mimeType) throw new Error('当前浏览器不支持视频录制，请改用更新的 Chrome / Edge')
    if (typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) throw new Error('当前浏览器不支持 Canvas 采集')

    const startFrame = Math.max(0, Math.min(options.startFrame, project.settings.durationFrames - 1))
    const endFrame = Math.max(startFrame + 1, Math.min(options.endFrame, project.settings.durationFrames))
    const totalFrames = endFrame - startFrame
    const source = document.createElement('canvas')
    source.width = project.settings.width
    source.height = project.settings.height
    const output = document.createElement('canvas')
    output.width = options.width
    output.height = options.height
    const sourceCtx = source.getContext('2d')
    const outputCtx = output.getContext('2d')
    if (!sourceCtx || !outputCtx) throw new Error('无法创建导出画布')

    const stream = output.captureStream(0)
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
    const recorder = createRecorder(stream, mimeType, qualityBitrate(options.quality))
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data) }

    const assets = new MaterialAssetLoader()
    const renderer = new CanvasSceneRenderer()
    const fit = containRect(source.width, source.height, output.width, output.height)

    try {
      await new Promise<void>((resolve, reject) => {
        recorder.onstart = () => resolve()
        recorder.onerror = () => reject(new Error('录制器启动失败'))
        recorder.start(200)
      })

      for (let frame = startFrame; frame < endFrame; frame += 1) {
        if (signal.aborted) throw abortError()
        await assets.seek(project, frame)
        await renderer.render(sourceCtx, project, frame, assets)
        outputCtx.fillStyle = '#000000'
        outputCtx.fillRect(0, 0, output.width, output.height)
        outputCtx.drawImage(source, fit.x, fit.y, fit.width, fit.height)
        track?.requestFrame?.()
        handlers.onProgress?.({
          currentFrame: frame - startFrame + 1,
          totalFrames,
          percent: Math.round(((frame - startFrame + 1) / totalFrames) * 100),
          elapsedMs: 0,
          remainingMs: null,
          message: '正在导出视频...',
        })
        await wait(Math.max(16, Math.round(1000 / options.fps)), signal)
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
        recorder.onerror = () => reject(new Error('录制失败'))
        if (recorder.state !== 'inactive') recorder.stop()
        else resolve(new Blob(chunks, { type: mimeType }))
      })
      if (!blob.size) throw new Error('导出结果为空，请缩短时间轴或更换浏览器后再试')
      return blob
    } finally {
      if (recorder.state !== 'inactive') recorder.stop()
      stream.getTracks().forEach((item) => item.stop())
      assets.dispose()
    }
  }
}
