import type { EditorProject, TimelineClip } from '@/types/editor'
import { isTrackHidden } from '@/utils/timeline/tracks'

export type SceneSource = CanvasImageSource

export interface SceneAssetResolver {
  get(materialId: string): SceneSource | undefined
}

export function resolveActiveClips(project: EditorProject, currentFrame: number): TimelineClip[] {
  return project.clips
    .filter((clip) => currentFrame >= clip.startFrame && currentFrame < clip.startFrame + clip.durationFrames)
    .filter((clip) => !isTrackHidden(project, clip.trackId))
    .sort((left, right) => left.zIndex - right.zIndex)
}

export function sourceFrame(clip: TimelineClip, currentFrame: number): number {
  return clip.offsetFrame + currentFrame - clip.startFrame
}

export class CanvasSceneRenderer {
  async render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, project: EditorProject, currentFrame: number, assets: SceneAssetResolver): Promise<void> {
    const { width, height } = project.settings
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#10141d'
    ctx.fillRect(0, 0, width, height)
    resolveActiveClips(project, currentFrame).forEach((clip) => {
      if (clip.type !== 'audio') this.renderClip(ctx as CanvasRenderingContext2D, clip, assets)
    })
  }

  private renderClip(ctx: CanvasRenderingContext2D, clip: TimelineClip, assets: SceneAssetResolver): void {
    const transform = clip.transform
    ctx.save()
    ctx.translate(transform.x, transform.y)
    ctx.rotate(transform.rotation * Math.PI / 180)
    ctx.scale(transform.scaleX, transform.scaleY)
    ctx.globalAlpha = transform.opacity
    if (clip.type === 'text') this.renderText(ctx, clip)
    else {
      const source = clip.materialId ? assets.get(clip.materialId) : undefined
      if (source) ctx.drawImage(source, -transform.width / 2, -transform.height / 2, transform.width, transform.height)
      else this.renderPlaceholder(ctx, clip)
    }
    ctx.restore()
  }

  private renderText(ctx: CanvasRenderingContext2D, clip: TimelineClip): void {
    const text = clip.text
    if (!text) return
    ctx.fillStyle = text.color
    ctx.font = `${text.fontWeight} ${text.fontSize}px ${text.fontFamily}`
    ctx.textAlign = text.align
    ctx.textBaseline = 'middle'
    const lines = text.content.split(/\r?\n/)
    const lineHeight = text.fontSize * text.lineHeight
    lines.forEach((line, index) => this.fillText(ctx, line, -((lines.length - 1) * lineHeight) / 2 + index * lineHeight, text.letterSpacing))
  }

  private fillText(ctx: CanvasRenderingContext2D, value: string, y: number, letterSpacing: number): void {
    if (!letterSpacing) { ctx.fillText(value, 0, y); return }
    const glyphWidths = [...value].map((glyph) => ctx.measureText(glyph).width)
    const totalWidth = glyphWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, value.length - 1) * letterSpacing
    let x = ctx.textAlign === 'left' ? 0 : ctx.textAlign === 'right' ? -totalWidth : -totalWidth / 2
    ;[...value].forEach((glyph, index) => { ctx.fillText(glyph, x, y); x += glyphWidths[index] + letterSpacing })
  }

  private renderPlaceholder(ctx: CanvasRenderingContext2D, clip: TimelineClip): void {
    const { width, height } = clip.transform
    ctx.fillStyle = clip.type === 'video' ? '#28456e' : '#553b70'
    ctx.fillRect(-width / 2, -height / 2, width, height)
    ctx.fillStyle = '#b8cced'
    ctx.font = 'bold 30px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(clip.type.toUpperCase(), 0, 10)
  }
}
