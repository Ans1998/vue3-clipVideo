import type { EditorProject } from '@/types/editor'
import type { ExportOptions } from '@/types/export'
import { abortError } from '@/services/task/TaskProgress'
import { CanvasSceneRenderer } from '@/services/renderer/SceneRenderer'
import { MaterialAssetLoader } from '@/services/renderer/MaterialAssetLoader'
import { containRect } from '@/utils/format'
import { mixOccupiedAudio } from '@/services/export/AudioMixer'
import { evenSize } from '@/services/export/codecs'
import { pickRecorderMimeType, qualityBitrate, type ExportHandlers, type VideoExporter } from '@/services/export/VideoExporter'
import { resolveExportTimeline } from '@/utils/timeline/exportRange'

function createRecorder(stream: MediaStream, mimeType: string, bitrate: number): MediaRecorder {
  try { return new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate, audioBitsPerSecond: 128_000 }) }
  catch {
    try { return new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate }) }
    catch { return new MediaRecorder(stream, { mimeType }) }
  }
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
    if (typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) throw new Error('当前浏览器不支持 Canvas 采集')

    const width = evenSize(options.width)
    const height = evenSize(options.height)
    const frames = resolveExportTimeline(project, options)
    if (!frames.length) throw new Error('时间轴上没有可导出的内容')
    const totalFrames = frames.length
    const source = document.createElement('canvas')
    source.width = project.settings.width
    source.height = project.settings.height
    const output = document.createElement('canvas')
    output.width = width
    output.height = height
    const sourceCtx = source.getContext('2d', { alpha: false })
    const outputCtx = output.getContext('2d', { alpha: false })
    if (!sourceCtx || !outputCtx) throw new Error('无法创建导出画布')

    handlers.onProgress?.({ currentFrame: 0, totalFrames, percent: 0, elapsedMs: 0, remainingMs: null, message: '正在混合音频...' })
    const audioBuffer = await mixOccupiedAudio(project, frames, project.settings.fps, options.fps)
    if (signal.aborted) throw abortError()
    const mimeType = pickRecorderMimeType(options.format, Boolean(audioBuffer))
    if (!mimeType) throw new Error('当前浏览器不支持视频录制，请改用更新的 Chrome / Edge')

    const canvasStream = output.captureStream(options.fps)
    const videoTrack = canvasStream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined
    let audioContext: AudioContext | undefined
    let audioSource: AudioBufferSourceNode | undefined
    const tracks = [...canvasStream.getVideoTracks()]
    if (audioBuffer) {
      audioContext = new AudioContext({ sampleRate: audioBuffer.sampleRate })
      if (audioContext.state === 'suspended') await audioContext.resume()
      const dest = audioContext.createMediaStreamDestination()
      audioSource = audioContext.createBufferSource()
      audioSource.buffer = audioBuffer
      audioSource.connect(dest)
      tracks.push(...dest.stream.getAudioTracks())
    }
    const stream = new MediaStream(tracks)
    const recorder = createRecorder(stream, mimeType, qualityBitrate(options.quality))
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data) }

    const assets = new MaterialAssetLoader()
    const renderer = new CanvasSceneRenderer()
    const fit = containRect(source.width, source.height, output.width, output.height)
    const frameDelay = Math.max(16, Math.round(1000 / options.fps))

    try {
      await assets.seek(project, frames[0])
      await renderer.render(sourceCtx, project, frames[0], assets)
      outputCtx.fillStyle = '#000000'
      outputCtx.fillRect(0, 0, width, height)
      outputCtx.drawImage(source, fit.x, fit.y, fit.width, fit.height)
      videoTrack?.requestFrame?.()

      await new Promise<void>((resolve, reject) => {
        recorder.onstart = () => resolve()
        recorder.onerror = () => reject(new Error('录制器启动失败'))
        try { recorder.start(500) }
        catch (reason) { reject(reason instanceof Error ? reason : new Error('录制器启动失败')) }
      })
      audioSource?.start(0)

      for (let index = 0; index < frames.length; index += 1) {
        if (signal.aborted) throw abortError()
        if (index !== 0) {
          await assets.seek(project, frames[index])
          await renderer.render(sourceCtx, project, frames[index], assets)
          outputCtx.fillStyle = '#000000'
          outputCtx.fillRect(0, 0, width, height)
          outputCtx.drawImage(source, fit.x, fit.y, fit.width, fit.height)
        }
        videoTrack?.requestFrame?.()
        handlers.onProgress?.({
          currentFrame: index + 1,
          totalFrames,
          percent: Math.round(((index + 1) / totalFrames) * 100),
          elapsedMs: 0,
          remainingMs: null,
          message: '正在导出视频...',
        })
        await wait(frameDelay, signal)
      }

      await wait(Math.max(frameDelay, 80), signal)
      if (recorder.state === 'recording' && typeof recorder.requestData === 'function') recorder.requestData()
      const blob = await new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }))
        recorder.onerror = () => reject(new Error('录制失败'))
        if (recorder.state !== 'inactive') recorder.stop()
        else resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }))
      })
      if (!blob.size) throw new Error('导出结果为空，请缩短时间轴或更换浏览器后再试')
      return blob
    } finally {
      try { audioSource?.stop() } catch { /* already stopped */ }
      void audioContext?.close()
      if (recorder.state !== 'inactive') recorder.stop()
      stream.getTracks().forEach((item) => item.stop())
      canvasStream.getTracks().forEach((item) => item.stop())
      assets.dispose()
    }
  }
}
