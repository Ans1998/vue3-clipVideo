import type { EditorProject } from '@/types/editor'
import { materialStorage } from '@/services/storage/IndexedDBService'
import { sourceFrame } from '@/services/renderer/SceneRenderer'
import { effectiveClipGain } from '@/utils/timeline/tracks'

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
    const source = offline.createBufferSource()
    source.buffer = decoded
    const node = offline.createGain()
    node.gain.value = gain
    source.connect(node)
    node.connect(offline.destination)
    const startSec = (clip.startFrame - startFrame) / fps
    const offsetSec = sourceFrame(clip, Math.max(startFrame, clip.startFrame)) / fps
    const playDuration = Math.min((Math.min(endFrame, clip.startFrame + clip.durationFrames) - Math.max(startFrame, clip.startFrame)) / fps, Math.max(0, decoded.duration - offsetSec))
    if (playDuration <= 0) continue
    source.start(Math.max(0, startSec), Math.max(0, offsetSec), playDuration)
    mixed += 1
  }
  if (!mixed) return null
  return offline.startRendering()
}

export async function mixOccupiedAudio(project: EditorProject, frames: number[], fps: number): Promise<AudioBuffer | null> {
  if (!frames.length) return null
  const startFrame = frames[0]
  const endFrame = frames[frames.length - 1] + 1
  const mixed = await mixProjectAudio(project, startFrame, endFrame, fps)
  if (!mixed) return null
  if (frames.length === endFrame - startFrame) return mixed
  const samplesPerFrame = mixed.sampleRate / fps
  const length = Math.max(1, Math.round(frames.length * samplesPerFrame))
  const compact = new OfflineAudioContext(mixed.numberOfChannels, length, mixed.sampleRate).createBuffer(mixed.numberOfChannels, length, mixed.sampleRate)
  for (let channel = 0; channel < mixed.numberOfChannels; channel += 1) {
    const source = mixed.getChannelData(channel)
    const dest = compact.getChannelData(channel)
    frames.forEach((frame, index) => {
      const from = Math.round((frame - startFrame) * samplesPerFrame)
      const to = Math.round(index * samplesPerFrame)
      const count = Math.min(Math.round(samplesPerFrame), source.length - from, dest.length - to)
      if (count > 0) dest.set(source.subarray(from, from + count), to)
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
