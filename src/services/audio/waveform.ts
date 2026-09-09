import { materialStorage } from '@/services/storage/IndexedDBService'

const cache = new Map<string, number[]>()
const pending = new Map<string, Promise<number[]>>()

export async function materialPeaks(materialId: string, bins = 96): Promise<number[]> {
  const cached = cache.get(materialId)
  if (cached) return cached
  const running = pending.get(materialId)
  if (running) return running
  const task = loadPeaks(materialId, bins)
  pending.set(materialId, task)
  try {
    const peaks = await task
    cache.set(materialId, peaks)
    return peaks
  } finally {
    pending.delete(materialId)
  }
}

async function loadPeaks(materialId: string, bins: number): Promise<number[]> {
  const blob = await materialStorage.getBlob(materialId)
  if (!blob) return []
  try {
    const context = new OfflineAudioContext(1, 1, 44100)
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    const channel = buffer.getChannelData(0)
    const size = Math.max(1, bins)
    const block = Math.max(1, Math.floor(channel.length / size))
    return Array.from({ length: size }, (_, index) => {
      const start = index * block
      let peak = 0
      for (let offset = 0; offset < block && start + offset < channel.length; offset += 1) {
        peak = Math.max(peak, Math.abs(channel[start + offset]))
      }
      return peak
    })
  } catch {
    return []
  }
}
