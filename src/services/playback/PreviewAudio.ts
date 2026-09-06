import type { EditorProject } from '@/types/editor'
import { sourceFrame } from '@/services/renderer/SceneRenderer'
import { seekMediaToFrame } from '@/utils/media/seek'
import { effectiveClipGain } from '@/utils/timeline/tracks'

export class PreviewAudioMixer {
  private readonly elements = new Map<string, HTMLMediaElement>()
  private playing = false

  async sync(project: EditorProject, frame: number, playing: boolean): Promise<void> {
    this.playing = playing
    const active = project.clips.filter((clip) => (
      (clip.type === 'audio' || clip.type === 'video')
      && frame >= clip.startFrame
      && frame < clip.startFrame + clip.durationFrames
      && clip.materialId
      && effectiveClipGain(project, clip.id) > 0
    ))
    const keep = new Set(active.map((clip) => clip.id))
    this.elements.forEach((element, id) => {
      if (keep.has(id)) return
      element.pause()
    })
    await Promise.all(active.map(async (clip) => {
      const material = project.materials.find((item) => item.id === clip.materialId)
      if (!material?.objectUrl || !clip.materialId) return
      let element = this.elements.get(clip.id)
      if (!element) {
        element = document.createElement(material.type === 'video' ? 'video' : 'audio')
        element.src = material.objectUrl
        element.preload = 'auto'
        ;(element as HTMLVideoElement).playsInline = true
        this.elements.set(clip.id, element)
        await new Promise<void>((resolve) => {
          element!.addEventListener('loadedmetadata', () => resolve(), { once: true })
          element!.addEventListener('error', () => resolve(), { once: true })
        })
      }
      element.volume = effectiveClipGain(project, clip.id)
      element.muted = element.volume === 0
      const target = sourceFrame(clip, frame) / project.settings.fps
      if (!playing) {
        element.pause()
        await seekMediaToFrame(element, sourceFrame(clip, frame), project.settings.fps)
        return
      }
      if (Math.abs(element.currentTime - target) > 0.12) await seekMediaToFrame(element, sourceFrame(clip, frame), project.settings.fps)
      if (element.paused) void element.play().catch(() => undefined)
    }))
    if (!playing) this.elements.forEach((element) => { if (!element.paused) element.pause() })
  }

  dispose(): void {
    this.elements.forEach((element) => {
      element.pause()
      element.removeAttribute('src')
      element.load()
    })
    this.elements.clear()
  }
}
