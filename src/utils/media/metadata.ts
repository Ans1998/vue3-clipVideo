import type { MaterialType } from '@/types/editor'

const MAX_WARN_BYTES = 200 * 1024 * 1024

export function materialTypeOf(file: File): MaterialType | null {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('image/')) return 'image'
  const name = file.name.toLowerCase()
  if (/\.(mp4|webm|mov|mkv|m4v)$/.test(name)) return 'video'
  if (/\.(mp3|wav|aac|m4a|ogg|flac)$/.test(name)) return 'audio'
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return 'image'
  return null
}

export function isLargeMediaFile(file: File): boolean {
  return file.size > MAX_WARN_BYTES
}

export async function inspectMediaFile(file: File, fps: number): Promise<{ type: MaterialType; width?: number; height?: number; durationFrames?: number }> {
  const type = materialTypeOf(file)
  if (!type) throw new Error('仅支持视频、图片和音频素材')
  const objectUrl = URL.createObjectURL(file)
  try {
    if (type === 'image') {
      const image = new Image()
      image.src = objectUrl
      await image.decode()
      return { type, width: image.naturalWidth, height: image.naturalHeight }
    }
    const media = document.createElement(type === 'video' ? 'video' : 'audio')
    media.preload = 'metadata'
    media.src = objectUrl
    await new Promise<void>((resolve, reject) => {
      media.addEventListener('loadedmetadata', () => resolve(), { once: true })
      media.addEventListener('error', () => reject(new Error('无法读取媒体元数据')), { once: true })
    })
    const durationFrames = Math.max(1, Math.round((Number.isFinite(media.duration) ? media.duration : 0) * fps) || fps)
    if (type === 'video') {
      const video = media as HTMLVideoElement
      return { type, durationFrames, width: video.videoWidth, height: video.videoHeight }
    }
    return { type, durationFrames }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
