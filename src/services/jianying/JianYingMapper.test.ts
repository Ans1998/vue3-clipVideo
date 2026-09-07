import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@/services/project/factory'
import { DEFAULT_TRANSFORM } from '@/types/editor'
import { mapProjectToDraft } from '@/services/jianying/JianYingMapper'
import { canvasRatio, draftPathPlaceholder, framesToUs, JIANYING_MATERIAL_KEYS, JIANYING_PATH_TOKEN, mapTransform } from '@/services/jianying/JianYingTemplate'
import { planJianYingResources } from '@/services/jianying/resources'
import { frameToTimecode, timecodeToFrame } from '@/utils/timeline/timecode'
import { alignedPositions } from '@/utils/scene/align'
import { createTrack } from '@/utils/timeline/tracks'
import { groupResizePatches } from '@/utils/scene/groupResize'
import { sourceFrame } from '@/services/renderer/SceneRenderer'

describe('timecode', () => {
  it('round-trips HH:MM:SS:FF', () => {
    expect(frameToTimecode(105, 30)).toBe('00:00:03:15')
    expect(timecodeToFrame('00:00:03:15', 30)).toBe(105)
  })
})

describe('jianying mapper', () => {
  it('maps video, image, audio, extra tracks and transform into draft JSON', () => {
    const project = createEmptyProject('样本')
    project.settings.durationFrames = 300
    const extra = createTrack(project, 'video')
    project.materials.push(
      { id: 'mat-v', type: 'video', name: 'clip.mp4', mimeType: 'video/mp4', size: 12 },
      { id: 'mat-i', type: 'image', name: 'cover.png', mimeType: 'image/png', size: 8 },
      { id: 'mat-a', type: 'audio', name: 'bgm.mp3', mimeType: 'audio/mpeg', size: 4 },
    )
    project.clips.push(
      { id: 'v-1', trackId: extra.id, type: 'video', materialId: 'mat-v', startFrame: 0, durationFrames: 90, offsetFrame: 10, name: 'clip', zIndex: 0, locked: false, transform: { ...DEFAULT_TRANSFORM, x: 960, y: 540, width: 1920, height: 1080 }, audio: { volume: 0.8, muted: false } },
      { id: 'i-1', trackId: 'visual-1', type: 'image', materialId: 'mat-i', startFrame: 30, durationFrames: 60, offsetFrame: 0, name: 'cover', zIndex: 1, locked: false, transform: { ...DEFAULT_TRANSFORM, x: 480, y: 270, width: 400, height: 300 } },
      { id: 'a-1', trackId: 'audio-1', type: 'audio', materialId: 'mat-a', startFrame: 0, durationFrames: 120, offsetFrame: 0, name: 'bgm', zIndex: 2, locked: false, transform: { ...DEFAULT_TRANSFORM }, audio: { volume: 1, muted: false } },
      { id: 'text-1', trackId: 'text-1', type: 'text', startFrame: 30, durationFrames: 60, offsetFrame: 0, name: '标题', zIndex: 3, locked: false, transform: { ...DEFAULT_TRANSFORM, x: 960, y: 540, width: 800, height: 200 }, text: { content: 'Hello', fontFamily: 'Arial', fontSize: 64, fontWeight: 700, color: '#ffffff', align: 'center', lineHeight: 1.2, letterSpacing: 0 } },
    )
    const draftId = '0E685133-18CE-45ED-8CB8-2904A212EC80'
    const resources = planJianYingResources(project, draftId)
    const { content, meta } = mapProjectToDraft(project, resources, draftId)
    expect(meta.draft_name).toBe('样本')
    expect(meta.draft_is_invisible).toBe(false)
    expect(meta.draft_cover).toBe('draft_cover.jpg')
    expect(content.source).toBe('default')
    expect(content.name).toBe('')
    expect(content.new_version).toBe('110.0.0')
    expect((content.platform as { app_version: string; app_id: number }).app_version).toBe('5.9.0')
    expect((content.platform as { app_id: number }).app_id).toBe(3704)
    expect(content.duration).toBe(framesToUs(120, 30))
    expect((content.canvas_config as { ratio: string }).ratio).toBe(canvasRatio(1920, 1080))
    const materials = content.materials as Record<string, unknown> & { videos: Array<{ type: string; path: string; category_name: string; check_flag: number }>; audios: Array<{ path: string }>; texts: Array<{ content: string }>; speeds: Array<{ id: string }> }
    for (const key of JIANYING_MATERIAL_KEYS) expect(Array.isArray(materials[key])).toBe(true)
    expect(materials.videos.map((item) => item.type).sort()).toEqual(['photo', 'video'])
    expect(materials.videos[0].category_name).toBe('local')
    expect(materials.videos[0].check_flag).toBe(63487)
    expect(materials.videos.some((item) => item.path === `${JIANYING_PATH_TOKEN}/Resources/local/video/clip.mp4`)).toBe(true)
    expect(draftPathPlaceholder(draftId)).toBe(JIANYING_PATH_TOKEN)
    expect(materials.audios[0].path).toBe(`${JIANYING_PATH_TOKEN}/Resources/local/audio/bgm.mp3`)
    expect(materials.texts[0].content).toContain('Hello')
    const tracks = content.tracks as Array<{ type: string; name: string; segments: Array<{ material_id: string; extra_material_refs: string[]; target_timerange: { start: number } }> }>
    expect(tracks.filter((track) => track.type === 'video').length).toBeGreaterThan(1)
    expect(tracks.every((track) => track.name === '')).toBe(true)
    const textTrack = tracks.find((track) => track.type === 'text')
    expect(textTrack?.segments[0].target_timerange.start).toBe(framesToUs(30, 30))
    const mediaSegments = tracks.flatMap((track) => track.segments).filter((segment) => segment.extra_material_refs.length)
    expect(mediaSegments.length).toBe(3)
    expect(mediaSegments.every((segment) => materials.speeds.some((speed) => speed.id === segment.extra_material_refs[0]))).toBe(true)
    const metaMaterials = (meta.draft_materials as Array<{ type: number; value: Array<{ file_Path: string; extra_info: string; metetype: string }> }>)[0].value
    expect(metaMaterials.some((item) => item.file_Path === './Resources/local/video/clip.mp4' && item.metetype === 'video')).toBe(true)
    expect(metaMaterials.some((item) => item.extra_info === 'bgm.mp3' && item.metetype === 'music')).toBe(true)
    const mapped = mapTransform(960, 540, 800, 200, 1, 1, 0, 1, 1920, 1080)
    expect(mapped.x).toBe(0)
    expect(mapped.y).toBe(0)
  })

  it('maps text, transform and tracks into draft JSON', () => {
    const project = createEmptyProject('样本')
    project.settings.durationFrames = 300
    project.clips.push({
      id: 'text-1',
      trackId: 'text-1',
      type: 'text',
      startFrame: 30,
      durationFrames: 60,
      offsetFrame: 0,
      name: '标题',
      zIndex: 0,
      locked: false,
      transform: { ...DEFAULT_TRANSFORM, x: 960, y: 540, width: 800, height: 200 },
      text: { content: 'Hello', fontFamily: 'Arial', fontSize: 64, fontWeight: 700, color: '#ffffff', align: 'center', lineHeight: 1.2, letterSpacing: 0 },
    })
    const { content, meta } = mapProjectToDraft(project)
    expect(meta.draft_name).toBe('样本')
    expect(content.duration).toBe(framesToUs(90, 30))
    expect((content.canvas_config as { ratio: string }).ratio).toBe(canvasRatio(1920, 1080))
    const textTrack = (content.tracks as Array<{ type: string; segments: Array<{ target_timerange: { start: number } }> }>).find((track) => track.type === 'text')
    expect(textTrack?.segments[0].target_timerange.start).toBe(framesToUs(30, 30))
    expect((content.materials as { texts: Array<{ content: string }> }).texts[0].content).toContain('Hello')
    const mapped = mapTransform(960, 540, 800, 200, 1, 1, 0, 1, 1920, 1080)
    expect(mapped.x).toBe(0)
    expect(mapped.y).toBe(0)
  })
})

describe('timeline helpers', () => {
  it('creates extra tracks and computes source frames', () => {
    const project = createEmptyProject()
    const extra = createTrack(project, 'video')
    expect(project.tracks.some((track) => track.id === extra.id)).toBe(true)
    expect(sourceFrame({ offsetFrame: 10, startFrame: 20, durationFrames: 30, id: 'c', trackId: extra.id, type: 'video', name: '', zIndex: 0, locked: false, transform: DEFAULT_TRANSFORM }, 25)).toBe(15)
  })

  it('aligns selected clips to the left', () => {
    const clips = [
      { id: 'a', transform: { ...DEFAULT_TRANSFORM, x: 400, y: 200, width: 100, height: 100, scaleX: 1, scaleY: 1, rotation: 0 } },
      { id: 'b', transform: { ...DEFAULT_TRANSFORM, x: 900, y: 400, width: 100, height: 100, scaleX: 1, scaleY: 1, rotation: 0 } },
    ] as never
    const result = alignedPositions(clips, 'left')
    expect(result.get('a')?.x).toBe(result.get('b')?.x)
  })

  it('scales a group from the east handle', () => {
    const patches = groupResizePatches(
      [
        { id: 'a', transform: { ...DEFAULT_TRANSFORM, x: 100, y: 100, width: 100, height: 100 } },
        { id: 'b', transform: { ...DEFAULT_TRANSFORM, x: 300, y: 100, width: 100, height: 100 } },
      ],
      { ...DEFAULT_TRANSFORM, x: 200, y: 100, width: 300, height: 100 },
      'e',
      { x: 650, y: 100 },
      false,
    )
    expect(patches[0].patch.scaleX).toBeCloseTo(2)
    expect(patches[1].patch.x).toBe(550)
  })
})
