import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer'
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer'
import type { EditorProject } from '@/types/editor'
import type { ExportOptions } from '@/types/export'
import { abortError } from '@/services/task/TaskProgress'
import { CanvasSceneRenderer } from '@/services/renderer/SceneRenderer'
import { MaterialAssetLoader } from '@/services/renderer/MaterialAssetLoader'
import { containRect } from '@/utils/format'
import { encodeAudioBuffer, mixOccupiedAudio } from '@/services/export/AudioMixer'
import { evenSize, pickAudioCodec, pickVideoCodec, webmVideoCodec } from '@/services/export/codecs'
import { qualityBitrate, type ExportHandlers, type VideoExporter } from '@/services/export/VideoExporter'
import { resolveExportTimeline } from '@/utils/timeline/exportRange'

function createCanvas(width: number, height: number): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
    if (ctx) return { canvas, ctx }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('无法创建导出画布')
  return { canvas, ctx }
}

export class WebCodecsExporter implements VideoExporter {
  readonly id = 'webcodecs'
  readonly label = 'WebCodecs + OffscreenCanvas'

  supports(_options: ExportOptions): boolean {
    return typeof globalThis !== 'undefined' && 'VideoEncoder' in globalThis
  }

  async export(project: EditorProject, options: ExportOptions, handlers: ExportHandlers = {}): Promise<Blob> {
    const signal = handlers.signal ?? new AbortController().signal
    const width = evenSize(options.width)
    const height = evenSize(options.height)
    const frames = resolveExportTimeline(project, options)
    if (!frames.length) throw new Error('时间轴上没有可导出的内容')
    const totalFrames = frames.length
    const bitrate = qualityBitrate(options.quality)
    const videoCodec = await pickVideoCodec(options.format, width, height, bitrate, options.fps)
    if (!videoCodec) throw new Error('当前浏览器不支持所选格式的 WebCodecs 编码器')

    handlers.onProgress?.({ currentFrame: 0, totalFrames, percent: 0, elapsedMs: 0, remainingMs: null, message: '正在混合音频...' })
    const audioBuffer = await mixOccupiedAudio(project, frames, project.settings.fps, options.fps)
    if (signal.aborted) throw abortError()
    const audioCodec = audioBuffer ? await pickAudioCodec(options.format, audioBuffer.numberOfChannels, audioBuffer.sampleRate) : null
    if (audioBuffer && !audioCodec) throw new Error('当前浏览器无法用 WebCodecs 编码音频')

    const source = createCanvas(project.settings.width, project.settings.height)
    const output = createCanvas(width, height)
    const fit = containRect(source.canvas.width, source.canvas.height, width, height)
    const assets = new MaterialAssetLoader()
    const renderer = new CanvasSceneRenderer()
    const isMp4 = options.format === 'mp4'
    const mp4Target = new Mp4Target()
    const webmTarget = new WebmTarget()
    const includeAudio = Boolean(audioBuffer && audioCodec)
    const mp4 = isMp4 ? new Mp4Muxer({
      target: mp4Target,
      video: { codec: 'avc', width, height, frameRate: options.fps },
      audio: includeAudio && audioBuffer && audioCodec ? { codec: audioCodec.mux, numberOfChannels: audioBuffer.numberOfChannels, sampleRate: audioBuffer.sampleRate } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    }) : null
    const webm = !isMp4 ? new WebmMuxer({
      target: webmTarget,
      video: { codec: webmVideoCodec(videoCodec.mux), width, height, frameRate: options.fps },
      audio: includeAudio && audioBuffer ? { codec: 'A_OPUS', numberOfChannels: audioBuffer.numberOfChannels, sampleRate: audioBuffer.sampleRate } : undefined,
      firstTimestampBehavior: 'offset',
    }) : null

    let encodeError: Error | null = null
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        try { mp4?.addVideoChunk(chunk, meta); webm?.addVideoChunk(chunk, meta) }
        catch (reason) { encodeError = reason instanceof Error ? reason : new Error('视频封装失败') }
      },
      error: (error) => { encodeError = error },
    })

    let audioEncoder: AudioEncoder | undefined
    const throwIfEncodeFailed = (): void => {
      if (encodeError) throw encodeError
      if (signal.aborted) throw abortError()
    }

    try {
      videoEncoder.configure({
        codec: videoCodec.codec,
        width,
        height,
        bitrate,
        framerate: options.fps,
        hardwareAcceleration: videoCodec.hardwareAcceleration,
        latencyMode: 'quality',
        ...(videoCodec.mux === 'avc' ? { avc: { format: 'avc' as const } } : {}),
      })
      if (includeAudio && audioBuffer && audioCodec) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => {
            try { mp4?.addAudioChunk(chunk, meta); webm?.addAudioChunk(chunk, meta) }
            catch (reason) { encodeError = reason instanceof Error ? reason : new Error('音频封装失败') }
          },
          error: (error) => { encodeError = error },
        })
        audioEncoder.configure({
          codec: audioCodec.codec,
          numberOfChannels: audioBuffer.numberOfChannels,
          sampleRate: audioBuffer.sampleRate,
          bitrate: 128_000,
        })
      }
      if (audioBuffer && audioEncoder) await encodeAudioBuffer(audioBuffer, audioEncoder)
      throwIfEncodeFailed()
      for (let index = 0; index < frames.length; index += 1) {
        throwIfEncodeFailed()
        while (videoEncoder.encodeQueueSize > 4) {
          await new Promise((resolve) => { videoEncoder.addEventListener('dequeue', () => resolve(undefined), { once: true }) })
          throwIfEncodeFailed()
        }
        const frame = frames[index]
        await assets.seek(project, frame)
        await renderer.render(source.ctx, project, frame, assets)
        output.ctx.fillStyle = '#000000'
        output.ctx.fillRect(0, 0, width, height)
        output.ctx.drawImage(source.canvas, fit.x, fit.y, fit.width, fit.height)
        const videoFrame = new VideoFrame(output.canvas, {
          timestamp: Math.round(index / options.fps * 1e6),
          duration: Math.round(1e6 / options.fps),
        })
        videoEncoder.encode(videoFrame, { keyFrame: index % Math.max(1, options.fps) === 0 })
        videoFrame.close()
        handlers.onProgress?.({
          currentFrame: index + 1,
          totalFrames,
          percent: Math.round(((index + 1) / totalFrames) * 100),
          elapsedMs: 0,
          remainingMs: null,
          message: '正在使用 WebCodecs 导出...',
        })
      }
      await videoEncoder.flush()
      throwIfEncodeFailed()
      try {
        mp4?.finalize()
        webm?.finalize()
      } catch (reason) {
        throw reason instanceof Error ? reason : new Error('封装失败，未得到视频文件')
      }
      const buffer = isMp4 ? mp4Target.buffer : webmTarget.buffer
      if (!buffer || buffer.byteLength < 32) throw new Error('封装失败，未得到视频文件')
      return new Blob([buffer], { type: isMp4 ? 'video/mp4' : 'video/webm' })
    } finally {
      try { if (videoEncoder.state !== 'closed') videoEncoder.close() } catch { /* ignore */ }
      try { if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close() } catch { /* ignore */ }
      assets.dispose()
    }
  }
}
