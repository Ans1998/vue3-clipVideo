import type { EditorProject, TimelineClip, TimelineTrack } from '@/types/editor'
import { canvasRatio, framesToUs, JIANYING_MAPPER_ID, JIANYING_VERSION, mapTransform } from '@/services/jianying/JianYingTemplate'

const TRACK_TYPE: Record<TimelineTrack['type'], number> = { visual: 0, audio: 1, text: 2 }

function resourceName(clip: TimelineClip, project: EditorProject): string {
  const material = project.materials.find((item) => item.id === clip.materialId)
  if (!material) return ''
  const ext = material.name.includes('.') ? material.name.slice(material.name.lastIndexOf('.')) : material.type === 'image' ? '.png' : material.type === 'audio' ? '.mp3' : '.mp4'
  return `${material.id}${ext}`
}

export function mapProjectToDraft(project: EditorProject): { content: Record<string, unknown>; meta: Record<string, unknown> } {
  const { width, height, fps, durationFrames } = project.settings
  const duration = framesToUs(durationFrames, fps)
  const videos: Record<string, unknown>[] = []
  const audios: Record<string, unknown>[] = []
  const texts: Record<string, unknown>[] = []
  const tracks = [...project.tracks].sort((left, right) => left.order - right.order).map((track) => {
    const segments = project.clips.filter((clip) => clip.trackId === track.id).sort((left, right) => left.startFrame - right.startFrame).map((clip) => {
      const transform = mapTransform(clip.transform.x, clip.transform.y, clip.transform.width, clip.transform.height, clip.transform.scaleX, clip.transform.scaleY, clip.transform.rotation, clip.transform.opacity, width, height)
      const path = resourceName(clip, project)
      if (clip.type === 'video' || clip.type === 'image') {
        videos.push({
          id: clip.materialId ?? clip.id,
          type: clip.type === 'image' ? 'photo' : 'video',
          path: path ? `Resources/${path}` : '',
          width: clip.transform.width,
          height: clip.transform.height,
          duration: framesToUs(clip.durationFrames, fps),
        })
      }
      if (clip.type === 'audio') {
        audios.push({
          id: clip.materialId ?? clip.id,
          type: 'extract_music',
          path: path ? `Resources/${path}` : '',
          duration: framesToUs(clip.durationFrames, fps),
        })
      }
      if (clip.type === 'text' && clip.text) {
        texts.push({
          id: clip.id,
          content: clip.text.content,
          font_size: clip.text.fontSize,
          font_name: clip.text.fontFamily,
          text_color: clip.text.color,
          alignment: clip.text.align,
          letter_spacing: clip.text.letterSpacing,
        })
      }
      return {
        id: clip.id,
        material_id: clip.type === 'text' ? clip.id : clip.materialId ?? clip.id,
        target_timerange: { start: framesToUs(clip.startFrame, fps), duration: framesToUs(clip.durationFrames, fps) },
        source_timerange: { start: framesToUs(clip.offsetFrame, fps), duration: framesToUs(clip.durationFrames, fps) },
        volume: clip.audio?.muted ? 0 : clip.audio?.volume ?? 1,
        clip: { transform: { x: transform.x, y: transform.y }, scale: { x: transform.scaleX, y: transform.scaleY }, rotation: transform.rotation, alpha: transform.alpha },
      }
    })
    return { id: track.id, type: TRACK_TYPE[track.type], name: track.name, segments }
  })

  const content = {
    mapper: JIANYING_MAPPER_ID,
    new_version: JIANYING_VERSION,
    id: project.id,
    fps,
    duration,
    canvas_config: { width, height, ratio: canvasRatio(width, height) },
    materials: { videos, audios, texts },
    tracks,
  }
  const meta = {
    draft_id: project.id,
    draft_name: project.name,
    tm_draft_create: project.createdAt * 1000,
    tm_draft_modified: project.updatedAt * 1000,
    draft_fold_path: '',
    draft_root_path: '',
    draft_cover: 'draft_cover.jpg',
    draft_materials: [...videos, ...audios].map((item) => ({ type: 0, value: item.path })),
  }
  return { content, meta }
}
