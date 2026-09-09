import type { EditorProject } from '@/types/editor'
import { materialStorage } from '@/services/storage/IndexedDBService'
import { sourceFrame } from '@/services/renderer/SceneRenderer'
import { effectiveClipGain } from '@/utils/timeline/tracks'
import { audioFade, clipSpeed } from '@/utils/timeline/clipPlayback'

const SAMPLE_RATE = 48000
const CHANNELS = 2

async function decodeMaterial(id: string): Promise<AudioBuffer | null> {
  const blob = await materialStorage.getBlob(id)
  if (!blob) return null
  const context = new OfflineAudioContext(CHANNELS, 1, SAMPLE_RATE)
  try {
    return await context.decodeAudioData(await blob.arrayBuffer())
  } catch {
    return null
  }
}

export async function mixProjectAudio(project: EditorProject, startFrame: number, endFrame: number, fps: number): Promise<AudioBuffer | null> {
  const duration = Math.max(1 / fps, (endFrame - startFrame) / fps)
  const clips = project.clips.filter((clip) => (clip.type === 'audio' || clip.type === 'video') && clip.materialId && clip.startFrame < endFrame && clip.startFrame + clip.durationFrames > startFrame)
  if (!clips.length) return null
  const offline = new OfflineAudioContext(CHANNELS, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE)
  let mixed = 0
  for (const clip of clips) {
    const decoded = clip.materialId ? await decodeMaterial(clip.materialId) : null
    if (!decoded) continue
    const gain = effectiveClipGain(project, clip.id)
    if (gain <= 0) continue
    const speed = clipSpeed(clip)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.playbackRate.value = speed
    const node = offline.createGain()
    const overlapStart = Math.max(startFrame, clip.startFrame)
    const overlapEnd = Math.min(endFrame, clip.startFrame + clip.durationFrames)
    const startSec = (clip.startFrame - startFrame) / fps
    const offsetSec = sourceFrame(clip, overlapStart) / fps
    const playDuration = (overlapEnd - overlapStart) / fps
    if (playDuration <= 0) continue
    const appear = Math.max(0, startSec)
    node.gain.setValueAtTime(gain * audioFade(clip, overlapStart), appear)
    const fadeInFrames = clip.audio?.fadeInFrames ?? clip.fadeInFrames ?? 0
    const fadeOutFrames = clip.audio?.fadeOutFrames ?? clip.fadeOutFrames ?? 0
    if (fadeInFrames > 0 && overlapStart < clip.startFrame + fadeInFrames) {
      const fadeEnd = Math.min(overlapEnd, clip.startFrame + fadeInFrames)
      node.gain.linearRampToValueAtTime(gain * audioFade(clip, fadeEnd), appear + (fadeEnd - overlapStart) / fps)
    }
    if (fadeOutFrames > 0 && overlapEnd > clip.startFrame + clip.durationFrames - fadeOutFrames) {
      const fadeStart = Math.max(overlapStart, clip.startFrame + clip.durationFrames - fadeOutFrames)
      node.gain.linearRampToValueAtTime(gain * audioFade(clip, fadeStart), appear + Math.max(0, fadeStart - overlapStart) / fps)
      node.gain.linearRampToValueAtTime(0, appear + playDuration)
    }
    source.connect(node)
    node.connect(offline.destination)
    source.start(appear, Math.max(0, offsetSec), playDuration * speed)
    mixed += 1
  }
  if (!mixed) return null
  return offline.startRendering()
}

export async function mixOccupiedAudio(project: EditorProject, frames: number[], sourceFps: number, exportFps = sourceFps): Promise<AudioBuffer | null> {
  if (!frames.length) return null
  const startFrame = Math.min(...frames)
  const endFrame = Math.max(...frames) + 1
  const mixed = await mixProjectAudio(project, startFrame, endFrame, sourceFps)
  if (!mixed) return null
  const samplesPerOutput = mixed.sampleRate / exportFps
  const length = Math.max(1, Math.round(frames.length * samplesPerOutput))
  const compact = new OfflineAudioContext(mixed.numberOfChannels, length, mixed.sampleRate).createBuffer(mixed.numberOfChannels, length, mixed.sampleRate)
  for (let channel = 0; channel < mixed.numberOfChannels; channel += 1) {
    const source = mixed.getChannelData(channel)
    const dest = compact.getChannelData(channel)
    let sub = 0
    frames.forEach((frame, index) => {
      const from = Math.round((frame - startFrame) * mixed.sampleRate / sourceFps + sub * samplesPerOutput)
      const to = Math.round(index * samplesPerOutput)
      const count = Math.min(Math.round(samplesPerOutput), source.length - from, dest.length - to)
      if (count > 0) dest.set(source.subarray(from, from + count), to)
      sub = frames[index + 1] === frame ? sub + 1 : 0
    })
  }
  return compact
}

export async function encodeAudioBuffer(buffer: AudioBuffer, encoder: AudioEncoder): Promise<void> {
  const channels = buffer.numberOfChannels
  const frameSize = 1024
  let offset = 0
  while (offset < buffer.length) {
    const frames = Math.min(frameSize, buffer.length - offset)
    const planar = new Float32Array(frames * channels)
    for (let channel = 0; channel < channels; channel += 1) {
      planar.set(buffer.getChannelData(channel).subarray(offset, offset + frames), channel * frames)
    }
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: buffer.sampleRate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round(offset / buffer.sampleRate * 1e6),
      data: planar,
    })
    encoder.encode(data)
    data.close()
    offset += frames
  }
  await encoder.flush()
}
