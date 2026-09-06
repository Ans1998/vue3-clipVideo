import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer'
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer'
import type { EditorProject } from '@/types/editor'
import type { ExportOptions } from '@/types/export'
import { abortError } from '@/services/task/TaskProgress'
import { CanvasSceneRenderer } from '@/services/renderer/SceneRenderer'
import { MaterialAssetLoader } from '@/services/renderer/MaterialAssetLoader'
import { containRect } from '@/utils/format'
import { encodeAudioBuffer, mixProjectAudio } from '@/services/export/AudioMixer'
import { pickRecorderMimeType, qualityBitrate, type ExportHandlers, type VideoExporter } from '@/services/export/VideoExporter'

interface CodecPick { video: string; audio: string; mux: 'avc' | 'vp9' }

async function pickCodecs(format: ExportOptions['format'], width: number, height: number, bitrate: number, fps: number): Promise<CodecPick | null> {
  if (!('VideoEncoder' in globalThis) || typeof VideoEncoder.isConfigSupported !== 'function') return null
  const videoCandidates = format === 'mp4' ? ['avc1.4D001F', 'avc1.42001E'] : ['vp09.00.10.08', 'vp8']
  for (const video of videoCandidates) {
    const support = await VideoEncoder.isConfigSupported({ codec: video, width, height, bitrate, framerate: fps })
    if (!support.supported) continue
    return { video, audio: format === 'mp4' ? 'mp4a.40.2' : 'opus', mux: format === 'mp4' ? 'avc' : 'vp9' }
  }
  return null
}

function createCanvas(width: number, height: number): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建 OffscreenCanvas')
    return { canvas, ctx }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
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
    const startFrame = Math.max(0, Math.min(options.startFrame, project.settings.durationFrames - 1))
    const endFrame = Math.max(startFrame + 1, Math.min(options.endFrame, project.settings.durationFrames))
    const totalFrames = endFrame - startFrame
    const bitrate = qualityBitrate(options.quality)
    const codecs = await pickCodecs(options.format, options.width, options.height, bitrate, options.fps)
    if (!codecs) throw new Error('当前浏览器不支持所选格式的 WebCodecs 编码器')

    handlers.onProgress?.({ currentFrame: 0, totalFrames, percent: 0, elapsedMs: 0, remainingMs: null, message: '正在混合音频...' })
    const audioBuffer = await mixProjectAudio(project, startFrame, endFrame, options.fps)
    if (signal.aborted) throw abortError()

    const source = createCanvas(project.settings.width, project.settings.height)
    const output = createCanvas(options.width, options.height)
    const fit = containRect(source.canvas.width, source.canvas.height, options.width, options.height)
    const assets = new MaterialAssetLoader()
    const renderer = new CanvasSceneRenderer()
    const isMp4 = options.format === 'mp4'
    const mp4Target = new Mp4Target()
    const webmTarget = new WebmTarget()
    const mp4 = isMp4 ? new Mp4Muxer({
      target: mp4Target,
      video: { codec: 'avc', width: options.width, height: options.height, frameRate: options.fps },
      audio: audioBuffer ? { codec: codecs.audio === 'opus' ? 'opus' : 'aac', numberOfChannels: audioBuffer.numberOfChannels, sampleRate: audioBuffer.sampleRate } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    }) : null
    const webm = !isMp4 ? new WebmMuxer({
      target: webmTarget,
      video: { codec: 'V_VP9', width: options.width, height: options.height, frameRate: options.fps },
      audio: audioBuffer ? { codec: 'A_OPUS', numberOfChannels: audioBuffer.numberOfChannels, sampleRate: audioBuffer.sampleRate } : undefined,
      firstTimestampBehavior: 'offset',
    }) : null

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => { mp4?.addVideoChunk(chunk, meta); webm?.addVideoChunk(chunk, meta) },
      error: (error) => { throw error },
    })
    videoEncoder.configure({ codec: codecs.video, width: options.width, height: options.height, bitrate, framerate: options.fps })

    let audioEncoder: AudioEncoder | undefined
    if (audioBuffer && 'AudioEncoder' in globalThis) {
      try {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => { mp4?.addAudioChunk(chunk, meta); webm?.addAudioChunk(chunk, meta) },
          error: () => undefined,
        })
        audioEncoder.configure({ codec: codecs.audio, numberOfChannels: audioBuffer.numberOfChannels, sampleRate: audioBuffer.sampleRate, bitrate: 192_000 })
      } catch {
        audioEncoder = undefined
      }
    }

    try {
      if (audioBuffer && audioEncoder) await encodeAudioBuffer(audioBuffer, audioEncoder)
      for (let frame = startFrame; frame < endFrame; frame += 1) {
        if (signal.aborted) throw abortError()
        while (videoEncoder.encodeQueueSize > 8) await new Promise((resolve) => { videoEncoder.addEventListener('dequeue', () => resolve(undefined), { once: true }) })
        await assets.seek(project, frame)
        await renderer.render(source.ctx, project, frame, assets)
        output.ctx.fillStyle = '#000000'
        output.ctx.fillRect(0, 0, options.width, options.height)
        output.ctx.drawImage(source.canvas, fit.x, fit.y, fit.width, fit.height)
        const videoFrame = new VideoFrame(output.canvas, {
          timestamp: Math.round((frame - startFrame) / options.fps * 1e6),
          duration: Math.round(1e6 / options.fps),
        })
        videoEncoder.encode(videoFrame, { keyFrame: (frame - startFrame) % options.fps === 0 })
        videoFrame.close()
        handlers.onProgress?.({
          currentFrame: frame - startFrame + 1,
          totalFrames,
          percent: Math.round(((frame - startFrame + 1) / totalFrames) * 100),
          elapsedMs: 0,
          remainingMs: null,
          message: '正在使用 WebCodecs 导出...',
        })
      }
      await videoEncoder.flush()
      mp4?.finalize()
      webm?.finalize()
      const buffer = isMp4 ? mp4Target.buffer : webmTarget.buffer
      if (!buffer) throw new Error('封装失败，未得到视频文件')
      return new Blob([buffer], { type: isMp4 ? 'video/mp4' : 'video/webm' })
    } finally {
      videoEncoder.close()
      audioEncoder?.close()
      assets.dispose()
    }
  }
}

export function canUseWebCodecs(): boolean {
  return typeof globalThis !== 'undefined' && 'VideoEncoder' in globalThis
}

export { pickRecorderMimeType }
