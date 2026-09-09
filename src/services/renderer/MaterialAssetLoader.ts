import type { EditorProject, TimelineClip } from '@/types/editor'
import { resolveActiveClips, sourceFrame, type SceneAssetResolver, type SceneSource } from '@/services/renderer/SceneRenderer'
import { seekMediaToFrame } from '@/utils/media/seek'
import { materialStorage } from '@/services/storage/IndexedDBService'

export function mediaCacheKey(clip: Pick<TimelineClip, 'id' | 'type' | 'materialId'>): string | undefined {
  if (!clip.materialId) return undefined
  return clip.type === 'video' ? `clip:${clip.id}` : `mat:${clip.materialId}`
}

export class MaterialAssetLoader implements SceneAssetResolver {
  private readonly media = new Map<string, SceneSource>()
  private readonly createdUrls = new Set<string>()

  get(clip: TimelineClip): SceneSource | undefined {
    const key = mediaCacheKey(clip)
    return key ? this.media.get(key) : undefined
  }

  async ensure(project: EditorProject, frame: number): Promise<void> {
    await Promise.all(resolveActiveClips(project, frame).map((clip) => this.load(project, clip)))
  }

  async seek(project: EditorProject, frame: number): Promise<void> {
    await this.ensure(project, frame)
    await Promise.all(resolveActiveClips(project, frame).map(async (clip) => {
      if (clip.type !== 'video') return
      const source = this.get(clip)
      if (!(source instanceof HTMLVideoElement)) return
      await seekMediaToFrame(source, sourceFrame(clip, frame), project.settings.fps)
    }))
  }

  dispose(): void {
    this.media.forEach((source) => {
      if (source instanceof HTMLVideoElement) {
        source.pause()
        source.removeAttribute('src')
        source.load()
      }
    })
    this.createdUrls.forEach((url) => URL.revokeObjectURL(url))
    this.createdUrls.clear()
    this.media.clear()
  }

  private async load(project: EditorProject, clip: TimelineClip): Promise<void> {
    const key = mediaCacheKey(clip)
    const materialId = clip.materialId
    if (!key || !materialId || this.media.has(key)) return
    const material = project.materials.find((item) => item.id === materialId)
    const objectUrl = material?.objectUrl || await materialStorage.getObjectUrl(materialId)
    if (!material || !objectUrl) return
    if (!material.objectUrl) this.createdUrls.add(objectUrl)
    if (material.type === 'image') {
      const image = new Image()
      image.src = objectUrl
      await image.decode()
      this.media.set(key, image)
      return
    }
    if (material.type === 'video') {
      const video = document.createElement('video')
      video.src = objectUrl
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadeddata', () => resolve(), { once: true })
        video.addEventListener('error', () => reject(new Error(`无法读取视频素材：${material.name}`)), { once: true })
      })
      this.media.set(key, video)
    }
  }
}
