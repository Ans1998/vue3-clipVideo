import type { EditorProject, TextConfig, TimelineTrack } from '@/types/editor'
import {
  canvasRatio,
  framesToUs,
  JIANYING_CROP,
  JIANYING_MATERIAL_KEYS,
  JIANYING_NEW_VERSION,
  JIANYING_PLATFORM,
  JIANYING_VERSION_CODE,
  mapTransform,
} from '@/services/jianying/JianYingTemplate'
import { audioAliasId, type JianYingPackedResource } from '@/services/jianying/resources'
import { exportContentRange } from '@/utils/timeline/exportRange'
import { clipSpeed } from '@/utils/timeline/clipPlayback'

const TRACK_TYPE: Record<TimelineTrack['type'], string> = { visual: 'video', audio: 'audio', text: 'text' }

function packedOf(resources: JianYingPackedResource[], materialId?: string): JianYingPackedResource | undefined {
  return materialId ? resources.find((item) => item.materialId === materialId) : undefined
}

function hexId(): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(16).slice(2)}`
  return uuid.replace(/-/g, '')
}

function parseColor(value: string): [number, number, number] {
  const hex = value.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return [1, 1, 1]
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number]
}

function emptyMaterials(): Record<string, unknown[]> {
  return Object.fromEntries(JIANYING_MATERIAL_KEYS.map((key) => [key, []]))
}

function textMaterial(id: string, text: TextConfig): Record<string, unknown> {
  const color = parseColor(text.color)
  const content = JSON.stringify({
    text: text.content,
    styles: [{
      range: [0, [...text.content].length],
      size: text.fontSize,
      italic: Boolean(text.italic),
      underline: Boolean(text.underline),
      fill: { content: { solid: { color } } },
    }],
  })
  return {
    id,
    type: 'text',
    content,
    font_path: '',
    font_name: text.fontFamily,
    font_size: text.fontSize,
    text_color: text.color,
    text_alpha: 1,
    letter_spacing: text.letterSpacing,
    alignment: text.align === 'left' ? 0 : text.align === 'right' ? 2 : 1,
    italic: Boolean(text.italic),
    underline: Boolean(text.underline),
    strikethrough: Boolean(text.strikethrough),
  }
}

function videoMaterial(resource: JianYingPackedResource, type: 'video' | 'photo'): Record<string, unknown> {
  return {
    audio_fade: '',
    category_id: '',
    category_name: 'local',
    check_flag: 63487,
    crop: { ...JIANYING_CROP },
    crop_ratio: 'free',
    crop_scale: 1,
    duration: resource.durationUs,
    extra_info: resource.extraInfo,
    has_audio: type === 'video',
    height: resource.height,
    id: resource.materialId,
    intensifies_audio: false,
    local_material_id: '',
    material_id: resource.materialId,
    material_name: resource.fileName,
    media_path: '',
    path: resource.draftPath,
    type,
    width: resource.width,
  }
}

function audioMaterial(resource: JianYingPackedResource): Record<string, unknown> {
  return {
    app_id: 0,
    category_id: '',
    category_name: 'local',
    check_flag: 3,
    duration: resource.durationUs,
    extra_info: resource.extraInfo,
    id: resource.materialId,
    music_id: '',
    name: resource.fileName,
    path: resource.draftPath,
    source_platform: 0,
    type: 'extract_music',
    wave_points: [],
  }
}

function speedMaterial(id: string, speed = 1): Record<string, unknown> {
  return { id, mode: 0, speed, type: 'speed' }
}

function clipMaterialId(clip: EditorProject['clips'][number], resources: JianYingPackedResource[]): string {
  if (clip.type === 'text') return clip.id
  if (clip.type === 'audio' && clip.materialId && packedOf(resources, audioAliasId(clip.materialId))) return audioAliasId(clip.materialId)
  return clip.materialId ?? clip.id
}

function clipSegment(project: EditorProject, clip: EditorProject['clips'][number], extraMaterialRefs: string[], resources: JianYingPackedResource[]): Record<string, unknown> {
  const { width, height, fps } = project.settings
  const transform = mapTransform(clip.transform.x, clip.transform.y, clip.transform.width, clip.transform.height, clip.transform.scaleX, clip.transform.scaleY, clip.transform.rotation, clip.transform.opacity, width, height)
  const track = project.tracks.find((item) => item.id === clip.trackId)
  const speed = clipSpeed(clip)
  return {
    id: clip.id,
    material_id: clipMaterialId(clip, resources),
    extra_material_refs: extraMaterialRefs,
    target_timerange: { start: framesToUs(clip.startFrame, fps), duration: framesToUs(clip.durationFrames, fps) },
    source_timerange: { start: framesToUs(clip.offsetFrame, fps), duration: framesToUs(Math.max(1, Math.round(clip.durationFrames * speed)), fps) },
    speed,
    volume: clip.audio?.muted || track?.muted ? 0 : clip.audio?.volume ?? 1,
    visible: !track?.hidden,
    reverse: false,
    last_nonzero_volume: 1,
    render_index: 0,
    track_render_index: 0,
    track_attribute: 0,
    enable_adjust: true,
    enable_color_correct_adjust: false,
    enable_color_curves: true,
    enable_color_match_adjust: false,
    enable_color_wheels: true,
    enable_lut: true,
    enable_smart_color_adjust: false,
    is_tone_modify: false,
    common_keyframes: [],
    keyframe_refs: [],
    uniform_scale: { on: true, value: 1 },
    hdr_settings: { intensity: 1, mode: 1, nits: 1000 },
    clip: {
      alpha: transform.alpha,
      flip: { horizontal: false, vertical: false },
      rotation: transform.rotation,
      scale: { x: transform.scaleX, y: transform.scaleY },
      transform: { x: transform.x, y: transform.y },
    },
  }
}

export function mapProjectToDraft(project: EditorProject, resources: JianYingPackedResource[] = [], draftId = project.id): { content: Record<string, unknown>; meta: Record<string, unknown> } {
  const { width, height, fps } = project.settings
  const contentRange = exportContentRange(project)
  const durationFrames = Math.max(project.settings.fps, contentRange?.endFrame ?? project.settings.durationFrames)
  const duration = framesToUs(durationFrames, fps)
  const videos: Record<string, unknown>[] = []
  const audios: Record<string, unknown>[] = []
  const texts: Record<string, unknown>[] = []
  const speeds: Record<string, unknown>[] = []
  const seen = new Set<string>()

  project.clips.forEach((clip) => {
    const packed = packedOf(resources, clip.materialId)
    if ((clip.type === 'video' || clip.type === 'image') && packed && !seen.has(`video:${packed.materialId}`)) {
      seen.add(`video:${packed.materialId}`)
      videos.push(videoMaterial(packed, clip.type === 'image' ? 'photo' : 'video'))
    }
    if (clip.type === 'audio') {
      const audioPack = clip.materialId ? packedOf(resources, audioAliasId(clip.materialId)) ?? packed : packed
      if (audioPack && !seen.has(`audio:${audioPack.materialId}`)) {
        seen.add(`audio:${audioPack.materialId}`)
        audios.push(audioMaterial(audioPack))
      }
    }
    if (clip.type === 'text' && clip.text) texts.push(textMaterial(clip.id, clip.text))
  })

  const tracks = [...project.tracks].sort((left, right) => left.order - right.order).map((track) => {
    const segments = project.clips.filter((clip) => clip.trackId === track.id).sort((left, right) => left.startFrame - right.startFrame).map((clip) => {
      const extraMaterialRefs: string[] = []
      if (clip.type !== 'text') {
        const speedId = hexId()
        speeds.push(speedMaterial(speedId, clipSpeed(clip)))
        extraMaterialRefs.push(speedId)
      }
      return clipSegment(project, clip, extraMaterialRefs, resources)
    })
    return {
      attribute: 0,
      flag: 0,
      id: track.id,
      is_default_name: true,
      name: '',
      segments,
      type: TRACK_TYPE[track.type],
    }
  })

  const materials = emptyMaterials()
  materials.videos = videos
  materials.audios = audios
  materials.texts = texts
  materials.speeds = speeds

  const content = {
    canvas_config: { width, height, ratio: canvasRatio(width, height) },
    color_space: 0,
    config: {
      adjust_max_index: 1,
      attachment_info: [],
      combination_max_index: 1,
      extract_audio_last_index: 1,
      lyrics_recognition_id: '',
      lyrics_sync: true,
      lyrics_taskinfo: [],
      maintrack_adsorb: true,
      material_save_mode: 0,
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_recognition_id: '',
      subtitle_sync: true,
      subtitle_taskinfo: [],
      system_font_list: [],
      video_mute: false,
    },
    cover: '',
    create_time: Math.floor(project.createdAt / 1000),
    duration,
    extra_info: '',
    fps,
    free_render_index_mode_on: false,
    id: draftId.toUpperCase(),
    keyframe_graph_list: [],
    keyframes: { adjusts: [], audios: [], effects: [], filters: [], handwrites: [], stickers: [], texts: [], videos: [] },
    last_modified_platform: { ...JIANYING_PLATFORM },
    platform: { ...JIANYING_PLATFORM },
    materials,
    name: '',
    new_version: JIANYING_NEW_VERSION,
    relationships: [],
    render_index_track_mode_on: false,
    source: 'default',
    static_cover_image_path: '',
    tracks,
    update_time: Math.floor(project.updatedAt / 1000),
    version: JIANYING_VERSION_CODE,
  }

  const nowMs = Date.now()
  const tm = nowMs * 1000
  const metaMaterials = resources.map((item) => ({
    id: item.materialId,
    type: 0,
    metetype: item.metetype,
    extra_info: item.extraInfo,
    file_Path: item.metaPath,
    duration: item.durationUs,
    width: item.width,
    height: item.height,
    md5: '',
    create_time: Math.floor(nowMs / 1000),
    import_time: Math.floor(nowMs / 1000),
    import_time_ms: nowMs,
    item_source: 1,
    roughcut_time_range: { duration: item.durationUs, start: 0 },
    sub_time_range: { duration: -1, start: -1 },
  }))

  const meta = {
    cloud_package_completed_time: '',
    draft_cloud_capcut_purchase_info: '',
    draft_cloud_last_action_download: false,
    draft_cloud_materials: [],
    draft_cloud_purchase_info: '',
    draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '',
    draft_cover: 'draft_cover.jpg',
    draft_deeplink_url: '',
    draft_enterprise_info: {
      draft_enterprise_extra: '',
      draft_enterprise_id: '',
      draft_enterprise_name: '',
      enterprise_material: [],
    },
    draft_fold_path: '',
    draft_id: draftId.toUpperCase(),
    draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false,
    draft_is_ai_translate: false,
    draft_is_article_video_draft: false,
    draft_is_from_deeplink: 'false',
    draft_is_invisible: false,
    draft_materials: [
      { type: 0, value: metaMaterials },
      { type: 1, value: [] },
      { type: 2, value: [] },
      { type: 3, value: [] },
      { type: 6, value: [] },
      { type: 7, value: [] },
      { type: 8, value: [] },
    ],
    draft_materials_copied_info: [],
    draft_name: project.name,
    draft_new_version: '',
    draft_removable_storage_device: '',
    draft_root_path: '',
    draft_segment_extra_info: [],
    draft_type: '',
    tm_draft_cloud_completed: '',
    tm_draft_cloud_modified: 0,
    tm_draft_create: tm,
    tm_draft_modified: tm,
    tm_draft_removed: 0,
    tm_duration: duration,
  }
  return { content, meta }
}
