import { describe, expect, it } from 'vitest'
import { evenSize, videoCodecCandidates, webmVideoCodec } from '@/services/export/codecs'
import { pickRecorderMimeType } from '@/services/export/VideoExporter'

describe('export codecs', () => {
  it('rounds export size to even pixels for H.264', () => {
    expect(evenSize(1080)).toBe(1080)
    expect(evenSize(1921)).toBe(1920)
    expect(evenSize(15)).toBe(16)
  })

  it('offers 1080p-capable H.264 and VP9 levels', () => {
    expect(videoCodecCandidates('mp4').some((item) => item.codec.includes('640028'))).toBe(true)
    expect(videoCodecCandidates('webm').some((item) => item.codec.includes('40.08'))).toBe(true)
    expect(webmVideoCodec('vp8')).toBe('V_VP8')
    expect(webmVideoCodec('vp9')).toBe('V_VP9')
  })

  it('prefers recorder mime types that include audio when mixing sound', () => {
    const original = globalThis.MediaRecorder
    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true,
      value: { isTypeSupported: (type: string) => type === 'video/webm;codecs=vp9,opus' || type === 'video/webm;codecs=vp9' },
    })
    try {
      expect(pickRecorderMimeType('webm', true)).toBe('video/webm;codecs=vp9,opus')
      expect(pickRecorderMimeType('webm', false)).toBe('video/webm;codecs=vp9,opus')
    } finally {
      if (original) Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: original })
      else Reflect.deleteProperty(globalThis, 'MediaRecorder')
    }
  })
})
