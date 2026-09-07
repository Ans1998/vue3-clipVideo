import type { ExportFormat } from '@/types/export'

export type EncoderAcceleration = 'no-preference' | 'prefer-hardware' | 'prefer-software'

export interface VideoCodecPick {
  codec: string
  mux: 'avc' | 'vp9' | 'vp8'
  hardwareAcceleration: EncoderAcceleration
}

export interface AudioCodecPick {
  codec: string
  mux: 'aac' | 'opus'
}

export function evenSize(value: number): number {
  return Math.max(16, Math.floor(value / 2) * 2)
}

export function videoCodecCandidates(format: ExportFormat): Array<{ codec: string; mux: VideoCodecPick['mux'] }> {
  if (format === 'mp4') {
    return [
      { codec: 'avc1.640032', mux: 'avc' },
      { codec: 'avc1.640028', mux: 'avc' },
      { codec: 'avc1.4D0028', mux: 'avc' },
      { codec: 'avc1.4D001F', mux: 'avc' },
      { codec: 'avc1.42E01E', mux: 'avc' },
    ]
  }
  return [
    { codec: 'vp09.00.51.08', mux: 'vp9' },
    { codec: 'vp09.00.41.08', mux: 'vp9' },
    { codec: 'vp09.00.40.08', mux: 'vp9' },
    { codec: 'vp8', mux: 'vp8' },
  ]
}

export async function pickVideoCodec(format: ExportFormat, width: number, height: number, bitrate: number, fps: number): Promise<VideoCodecPick | null> {
  if (!('VideoEncoder' in globalThis) || typeof VideoEncoder.isConfigSupported !== 'function') return null
  const accelerations: EncoderAcceleration[] = ['prefer-hardware', 'prefer-software', 'no-preference']
  for (const item of videoCodecCandidates(format)) {
    for (const hardwareAcceleration of accelerations) {
      try {
        const config: VideoEncoderConfig = {
          codec: item.codec,
          width,
          height,
          bitrate,
          framerate: fps,
          hardwareAcceleration,
        }
        if (item.mux === 'avc') Object.assign(config, { avc: { format: 'avc' } })
        const support = await VideoEncoder.isConfigSupported(config)
        if (support.supported) return { ...item, hardwareAcceleration }
      } catch {
        continue
      }
    }
  }
  return null
}

export async function pickAudioCodec(format: ExportFormat, numberOfChannels: number, sampleRate: number): Promise<AudioCodecPick | null> {
  if (!('AudioEncoder' in globalThis) || typeof AudioEncoder.isConfigSupported !== 'function') return null
  const candidates: AudioCodecPick[] = format === 'mp4'
    ? [{ codec: 'mp4a.40.2', mux: 'aac' }, { codec: 'opus', mux: 'opus' }]
    : [{ codec: 'opus', mux: 'opus' }]
  for (const item of candidates) {
    try {
      const support = await AudioEncoder.isConfigSupported({
        codec: item.codec,
        numberOfChannels,
        sampleRate,
        bitrate: 128_000,
      })
      if (support.supported) return item
    } catch {
      continue
    }
  }
  return null
}

export function webmVideoCodec(mux: VideoCodecPick['mux']): string {
  return mux === 'vp8' ? 'V_VP8' : 'V_VP9'
}
