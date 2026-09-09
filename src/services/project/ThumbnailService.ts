import type { EditorProject } from '@/types/editor'
import { CanvasSceneRenderer } from '@/services/renderer/SceneRenderer'
import { MaterialAssetLoader } from '@/services/renderer/MaterialAssetLoader'

const THUMB_WIDTH = 480

export async function captureProjectThumbnail(project: EditorProject): Promise<Blob> {
  const source = document.createElement('canvas')
  source.width = project.settings.width
  source.height = project.settings.height
  const ctx = source.getContext('2d')
  if (!ctx) throw new Error('无法创建缩略图画布')
  const assets = new MaterialAssetLoader()
  try {
    const frame = Math.min(project.currentFrame, Math.max(0, project.settings.durationFrames - 1))
    await assets.seek(project, frame)
    await new CanvasSceneRenderer().render(ctx, project, frame, assets)
  } finally {
    assets.dispose()
  }
  const height = Math.max(1, Math.round(THUMB_WIDTH * project.settings.height / project.settings.width))
  const thumb = document.createElement('canvas')
  thumb.width = THUMB_WIDTH
  thumb.height = height
  const thumbCtx = thumb.getContext('2d')
  if (!thumbCtx) throw new Error('无法缩放项目缩略图')
  thumbCtx.drawImage(source, 0, 0, THUMB_WIDTH, height)
  const blob = await new Promise<Blob | null>((resolve) => thumb.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new Error('缩略图编码失败')
  return blob
}
