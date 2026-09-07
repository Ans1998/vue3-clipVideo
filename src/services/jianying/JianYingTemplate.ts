export const JIANYING_VERSION = '5.9.0'
export const JIANYING_NEW_VERSION = '110.0.0'
export const JIANYING_VERSION_CODE = 360000
export const JIANYING_PHOTO_DURATION_US = 10_800_000_000
/** duo-video / jianying_writer 使用的固定占位符。剪映打开草稿时会替换成当前草稿目录，不能用随机 UUID。 */
export const JIANYING_PATH_TOKEN = '##_draftpath_placeholder_0E685133-18CE-45ED-8CB8-2904A212EC80_##'
export const JIANYING_PLATFORM = { app_id: 3704, app_source: 'lv', app_version: JIANYING_VERSION, os: 'windows' } as const
export const JIANYING_CROP = {
  upper_left_x: 0,
  upper_left_y: 0,
  upper_right_x: 1,
  upper_right_y: 0,
  lower_left_x: 0,
  lower_left_y: 1,
  lower_right_x: 1,
  lower_right_y: 1,
} as const
/** pyJianYingDraft 5.9 / hotclip 骨架：缺键会被剪映当成损坏草稿。 */
export const JIANYING_MATERIAL_KEYS = [
  'ai_translates', 'audio_balances', 'audio_effects', 'audio_fades', 'audio_track_indexes', 'audios', 'beats',
  'canvases', 'chromas', 'color_curves', 'digital_humans', 'drafts', 'effects', 'flowers', 'green_screens',
  'handwrites', 'hsl', 'images', 'log_color_wheels', 'loudnesses', 'manual_deformations', 'masks',
  'material_animations', 'material_colors', 'multi_language_refs', 'placeholders', 'plugin_effects',
  'primary_color_wheels', 'realtime_denoises', 'shapes', 'smart_crops', 'smart_relights', 'sound_channel_mappings',
  'speeds', 'stickers', 'tail_leaders', 'text_templates', 'texts', 'time_marks', 'transitions', 'video_effects',
  'video_trackings', 'videos', 'vocal_beautifys', 'vocal_separations',
] as const
export const JIANYING_EMPTY_DIRS = ['Resources', 'common_attachment', 'matting', 'smart_crop', 'Resources/local/video', 'Resources/local/image', 'Resources/local/audio'] as const

export function draftPathPlaceholder(_draftId?: string): string {
  return JIANYING_PATH_TOKEN
}

export function framesToUs(frames: number, fps: number): number {
  return Math.round(Math.max(0, frames) / fps * 1_000_000)
}

export function canvasRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
  const divisor = gcd(width, height) || 1
  return `${width / divisor}:${height / divisor}`
}

export interface JianYingTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  alpha: number
}

export function mapTransform(x: number, y: number, width: number, height: number, scaleX: number, scaleY: number, rotation: number, opacity: number, canvasWidth: number, canvasHeight: number): JianYingTransform {
  return {
    x: Number(((x - canvasWidth / 2) / (canvasWidth / 2)).toFixed(6)),
    y: Number(((canvasHeight / 2 - y) / (canvasHeight / 2)).toFixed(6)),
    scaleX: Number(((width * scaleX) / canvasWidth).toFixed(6)),
    scaleY: Number(((height * scaleY) / canvasHeight).toFixed(6)),
    rotation,
    alpha: opacity,
  }
}
