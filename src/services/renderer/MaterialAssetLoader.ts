import type { EditorProject } from '@/types/editor'
import { resolveActiveClips, sourceFrame, type SceneAssetResolver, type SceneSource } from '@/services/renderer/SceneRenderer'
import { seekMediaToFrame } from '@/utils/media/seek'

export class MaterialAssetLoader implements SceneAssetResolver {
  private readonly media = new Map<string, SceneSource>()

  get(materialId: string): SceneSource | undefined {
    return this.media.get(materialId)
  }

  async ensure(project: EditorProject, frame: number): Promise<void> {
    await Promise.all(resolveActiveClips(project, frame).map((clip) => this.load(project, clip.materialId)))
  }

  async seek(project: EditorProject, frame: number): Promise<void> {
    await this.ensure(project, frame)
    await Promise.all(resolveActiveClips(project, frame).map(async (clip) => {
      if (clip.type !== 'video' || !clip.materialId) return
      const source = this.media.get(clip.materialId)
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
    this.media.clear()
  }

  private async load(project: EditorProject, materialId?: string): Promise<void> {
    if (!materialId || this.media.has(materialId)) return
    const material = project.materials.find((item) => item.id === materialId)
    if (!material?.objectUrl) return
    if (material.type === 'image') {
      const image = new Image()
      image.src = material.objectUrl
      await image.decode()
      this.media.set(materialId, image)
      return
    }
    if (material.type === 'video') {
      const video = document.createElement('video')
      video.src = material.objectUrl
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadeddata', () => resolve(), { once: true })
        video.addEventListener('error', () => reject(new Error(`无法读取视频素材：${material.name}`)), { once: true })
      })
      this.media.set(materialId, video)
    }
  }
}
