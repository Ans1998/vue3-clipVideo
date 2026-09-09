import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createEmptyProject } from '@/services/project/factory'
import { mapProjectToDraft } from '@/services/jianying/JianYingMapper'
import { buildDraftPackage } from '@/services/jianying/JianYingExporter'
import { planJianYingResources } from '@/services/jianying/resources'
import { resolveExportTimeline } from '@/utils/timeline/exportRange'
import { materialStorage } from '@/services/storage/IndexedDBService'
import { DEFAULT_TRANSFORM } from '@/types/editor'

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()
  return {
    ...actual,
    useDebounceFn: (fn: (...args: never[]) => unknown) => Object.assign(fn, { cancel() {} }),
  }
})

vi.mock('@/services/storage/IndexedDBService', () => ({
  materialStorage: {
    save: vi.fn(),
    getBlob: vi.fn(async () => null),
    getObjectUrl: vi.fn(async () => undefined),
    deleteMany: vi.fn(),
  },
}))

vi.mock('@/services/storage/ProjectStorage', () => ({
  projectStorage: {
    save: vi.fn(),
    setActiveId: vi.fn(),
    list: vi.fn(async () => []),
    listTrash: vi.fn(async () => []),
    quota: vi.fn(async () => ({ usage: 0, quota: 0 })),
    getThumbnail: vi.fn(),
    saveThumbnail: vi.fn(),
  },
}))

vi.mock('@/services/project/ThumbnailService', () => ({
  captureProjectThumbnail: vi.fn(async () => new Blob()),
}))

function stubWindow(): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      setTimeout: (handler: TimerHandler) => globalThis.setTimeout(handler, 0),
      addEventListener() {},
      removeEventListener() {},
    },
  })
}

describe('import → split → export flow', () => {
  beforeEach(() => {
    stubWindow()
    setActivePinia(createPinia())
  })

  it('splits an imported video, detaches audio, and keeps export/jianying output in sync', async () => {
    const { useEditorStore } = await import('@/stores/editor')
    const editor = useEditorStore()
    editor.project = createEmptyProject('验收')
    editor.project.materials.push({
      id: 'mat-v',
      type: 'video',
      name: 'shot.mp4',
      mimeType: 'video/mp4',
      size: 12,
      durationFrames: 90,
    })
    editor.addClip(editor.project.materials[0], 0)

    const clip = editor.project.clips.find((item) => item.type === 'video')
    expect(clip?.durationFrames).toBe(90)

    editor.selectClip(clip!.id)
    editor.setCurrentFrame(30)
    expect(editor.splitSelectedAtPlayhead()).toBe(true)
    const videos = editor.project.clips.filter((item) => item.type === 'video').sort((a, b) => a.startFrame - b.startFrame)
    expect(videos).toHaveLength(2)
    const [left, right] = videos
    expect(left.durationFrames).toBe(30)
    expect(right.startFrame).toBe(30)
    expect(right.offsetFrame).toBe(30)
    expect(right.durationFrames).toBe(60)

    editor.selectClip(left.id)
    expect(editor.splitClipAudio(left.id)).toBe(true)
    expect(editor.project.clips.some((item) => item.type === 'audio' && item.materialId === 'mat-v')).toBe(true)

    editor.toggleLock(left.id)
    editor.selectClip(left.id)
    editor.removeSelected()
    expect(editor.project.clips.some((item) => item.id === left.id)).toBe(true)

    const frames = resolveExportTimeline(editor.project, { startFrame: 0, endFrame: editor.project.settings.durationFrames, fps: 60 })
    expect(frames.length).toBe(180)
    expect(frames[0]).toBe(0)
    expect(frames.at(-1)).toBe(89)

    const unlocked = editor.project.clips.find((item) => item.type === 'video' && !item.locked)!
    editor.selectClip(unlocked.id)
    editor.updateClipSpeed(unlocked.id, 2)
    expect(unlocked.speed).toBe(2)
    expect(unlocked.durationFrames).toBe(30)

    editor.addText()
    const text = editor.project.clips.find((item) => item.type === 'text')
    expect(text).toBeTruthy()
    editor.selectClip(text!.id)
    editor.setCurrentFrame(text!.startFrame + Math.floor(text!.durationFrames / 2))
    expect(editor.splitSelectedAtPlayhead()).toBe(true)
    expect(editor.project.clips.filter((item) => item.type === 'text')).toHaveLength(2)

    const resources = planJianYingResources(editor.project, 'DRAFT-ID')
    expect(resources.some((item) => item.kind === 'video' && item.sourceId === 'mat-v')).toBe(true)
    expect(resources.some((item) => item.kind === 'audio' && item.materialId === 'audio-mat-v')).toBe(true)
    const { content } = mapProjectToDraft(editor.project, resources, 'DRAFT-ID')
    const audioTrack = (content.tracks as Array<{ type: string; segments: Array<{ material_id: string }> }>).find((track) => track.type === 'audio')
    expect(audioTrack?.segments[0].material_id).toBe('audio-mat-v')

    const packed = resources.map((item) => ({ ...item, blob: new Blob(['media']) }))
    const pkg = buildDraftPackage(editor.project, packed, 'DRAFT-ID')
    expect(pkg.files.some((file) => file.path.startsWith('Resources/local/video/'))).toBe(true)
    expect(pkg.files.some((file) => file.path.startsWith('Resources/local/audio/'))).toBe(true)
  })

  it('ripples later clips on the same track and keeps pasted groups on one track', async () => {
    const { useEditorStore } = await import('@/stores/editor')
    const editor = useEditorStore()
    editor.project = createEmptyProject('波纹')
    editor.project.clips.push(
      { id: 'a', trackId: 'visual-1', type: 'video', startFrame: 0, durationFrames: 40, offsetFrame: 0, name: 'a', zIndex: 0, locked: false, transform: { ...DEFAULT_TRANSFORM } },
      { id: 'b', trackId: 'visual-1', type: 'video', startFrame: 80, durationFrames: 20, offsetFrame: 0, name: 'b', zIndex: 1, locked: false, transform: { ...DEFAULT_TRANSFORM } },
      { id: 'c', trackId: 'audio-1', type: 'audio', startFrame: 0, durationFrames: 40, offsetFrame: 0, name: 'c', zIndex: 2, locked: false, transform: { ...DEFAULT_TRANSFORM } },
    )
    editor.selectClip('a')
    editor.removeSelected()
    expect(editor.project.clips.find((item) => item.id === 'b')?.startFrame).toBe(40)
    expect(editor.project.clips.find((item) => item.id === 'c')?.startFrame).toBe(0)

    editor.selectClips(['b', 'c'])
    expect(editor.copySelected()).toBe(true)
    expect(editor.pasteAtFrame(200)).toBe(true)
    const pasted = editor.project.clips.filter((item) => item.startFrame >= 200)
    expect(pasted.filter((item) => item.type === 'video').every((item) => item.trackId === 'visual-1')).toBe(true)
    expect(pasted.filter((item) => item.type === 'audio').every((item) => item.trackId === 'audio-1')).toBe(true)
  })

  it('does not delete IndexedDB blobs so undo can restore a material', async () => {
    const { useEditorStore } = await import('@/stores/editor')
    const editor = useEditorStore()
    editor.project = createEmptyProject('素材')
    editor.project.materials.push({ id: 'mat-v', type: 'video', name: 'shot.mp4', mimeType: 'video/mp4', size: 12, durationFrames: 90 })
    editor.addClip(editor.project.materials[0], 0)
    await editor.removeMaterial('mat-v')
    expect(materialStorage.deleteMany).not.toHaveBeenCalled()
    expect(editor.project.materials).toHaveLength(0)
    expect(editor.project.clips).toHaveLength(0)
    editor.undo()
    expect(editor.project.materials.some((item) => item.id === 'mat-v')).toBe(true)
    expect(editor.project.clips.some((item) => item.materialId === 'mat-v')).toBe(true)
  })

  it('trims the left or right side of a clip at the playhead', async () => {
    const { useEditorStore } = await import('@/stores/editor')
    const editor = useEditorStore()
    editor.project = createEmptyProject('分割')
    editor.project.settings.rippleEdit = false
    editor.project.materials.push({ id: 'mat-v', type: 'video', name: 'shot.mp4', mimeType: 'video/mp4', size: 12, durationFrames: 90 })
    editor.project.clips.push(
      { id: 'v', trackId: 'visual-1', type: 'video', materialId: 'mat-v', startFrame: 0, durationFrames: 90, offsetFrame: 0, name: 'shot', zIndex: 0, locked: false, transform: { ...DEFAULT_TRANSFORM } },
    )
    editor.selectClip('v')
    editor.setCurrentFrame(30)
    expect(editor.splitSelectedLeft()).toBe(true)
    expect(editor.project.clips[0]).toMatchObject({ startFrame: 30, durationFrames: 60, offsetFrame: 30 })

    editor.undo()
    editor.selectClip('v')
    editor.setCurrentFrame(30)
    expect(editor.splitSelectedRight()).toBe(true)
    expect(editor.project.clips[0]).toMatchObject({ startFrame: 0, durationFrames: 30, offsetFrame: 0 })

    editor.undo()
    editor.project.settings.rippleEdit = true
    editor.project.clips.push(
      { id: 'later', trackId: 'visual-1', type: 'video', materialId: 'mat-v', startFrame: 120, durationFrames: 20, offsetFrame: 0, name: 'later', zIndex: 1, locked: false, transform: { ...DEFAULT_TRANSFORM } },
    )
    editor.selectClip('v')
    editor.setCurrentFrame(30)
    expect(editor.splitSelectedLeft()).toBe(true)
    expect(editor.project.clips.find((item) => item.id === 'v')).toMatchObject({ startFrame: 0, durationFrames: 60, offsetFrame: 30 })
    expect(editor.project.clips.find((item) => item.id === 'later')?.startFrame).toBe(90)
  })

  it('stores clip entrance transitions and ignores them on audio', async () => {
    const { useEditorStore } = await import('@/stores/editor')
    const editor = useEditorStore()
    editor.project = createEmptyProject('转场')
    editor.project.materials.push({
      id: 'mat-v',
      type: 'video',
      name: 'shot.mp4',
      mimeType: 'video/mp4',
      size: 12,
      durationFrames: 90,
    })
    editor.addClip(editor.project.materials[0], 0)
    const video = editor.project.clips.find((item) => item.type === 'video')!
    editor.updateClipTransition(video.id, 'in', { kind: 'slide-left' })
    editor.updateClipTransition(video.id, 'out', { kind: 'fade', durationFrames: 8 })
    expect(video.transitionIn).toMatchObject({ kind: 'slide-left' })
    expect(video.transitionOut).toMatchObject({ kind: 'fade', durationFrames: 8 })
    expect(video.fadeOutFrames).toBe(8)

    editor.addText()
    const text = editor.project.clips.find((item) => item.type === 'text')!
    editor.updateClipTransition(text.id, 'in', { kind: 'slide-up', durationFrames: 6 })
    expect(text.transitionIn).toMatchObject({ kind: 'slide-up', durationFrames: 6 })

    editor.project.clips.push({
      id: 'audio-1',
      trackId: 'audio-1',
      type: 'audio',
      startFrame: 0,
      durationFrames: 40,
      offsetFrame: 0,
      name: 'a',
      zIndex: 2,
      locked: false,
      transform: { ...DEFAULT_TRANSFORM },
    })
    editor.updateClipTransition('audio-1', 'in', { kind: 'fade' })
    expect(editor.project.clips.find((item) => item.id === 'audio-1')?.transitionIn?.kind).not.toBe('fade')
  })
})
