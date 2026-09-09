import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'
import { computed, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { materialStorage } from '@/services/storage/IndexedDBService'
import { projectStorage } from '@/services/storage/ProjectStorage'
import { captureProjectThumbnail } from '@/services/project/ThumbnailService'
import { cloneProject, cloneData, createEmptyProject, normalizeProject, serializeProject } from '@/services/project/factory'
import { clampClipTiming, clampDurationFrames, contentEndFrame, ensureDurationFrames, rescaleProjectFps, sourceLength, trimLeftTo, trimRightTo } from '@/utils/timeline/timing'
import { clipSpeed, durationForSpeed, resolvedTransition } from '@/utils/timeline/clipPlayback'
import { rippleRemove, rippleShift } from '@/utils/timeline/ripple'
import { DEFAULT_AUDIO, DEFAULT_FILTER, DEFAULT_TRANSFORM, DEFAULT_TRANSITION, createDefaultText, type ClipFilter, type ClipTransitionKind, type ClipType, type EditorProject, type Material, type ProjectSettings, type TextConfig, type TimelineClip, type TimelineTrack, type TrackType, type Transform } from '@/types/editor'
import type { ProjectSummary, StorageQuota } from '@/types/project'
import { alignedPositions, type AlignMode } from '@/utils/scene/align'
import { applyCanvasSize, CANVAS_PRESETS, type CanvasPresetId } from '@/utils/scene/canvas'
import { inspectMediaFile, isLargeMediaFile, materialTypeOf } from '@/utils/media/metadata'
import { canDetachAudio, canRemoveTrack, createTrack, isClipInteractable, movingClips, sortedTracks, trackAccepts, trackWouldOverlap, type TrackDropHint } from '@/utils/timeline/tracks'
import { useNotifyStore } from '@/stores/notify'

export const useEditorStore = defineStore('editor', () => {
  const project = ref<EditorProject>(createEmptyProject())
  const ready = ref(false)
  const summaries = ref<ProjectSummary[]>([])
  const trashSummaries = ref<ProjectSummary[]>([])
  const quota = ref<StorageQuota>({ usage: 0, quota: 0 })
  const selectedClipIds = ref<string[]>([])
  const selectedTrackId = ref('')
  const pixelsPerFrame = ref(4)
  const past = ref<string[]>([])
  const future = ref<string[]>([])
  const clipboard = ref<TimelineClip[]>([])
  const hasClipboard = computed(() => clipboard.value.length > 0)
  const dragMaterialId = ref('')
  const thumbnailUrls = new Map<string, string>()
  const activeClips = computed(() => project.value.clips.filter((clip) => project.value.currentFrame >= clip.startFrame && project.value.currentFrame < clip.startFrame + clip.durationFrames).sort((a, b) => a.zIndex - b.zIndex))
  const selectedClip = computed(() => project.value.clips.find((clip) => clip.id === selectedClipIds.value.at(-1)))
  const recentProjects = computed(() => summaries.value.filter((item) => item.id !== project.value.id).slice(0, 8))
  const missingMaterials = computed(() => project.value.materials.filter((item) => item.missing))
  const orderedTracks = computed(() => sortedTracks(project.value))
  const contentFrames = computed(() => contentEndFrame(project.value))
  const notify = useNotifyStore()

  function growTimeline(): void {
    if (ensureDurationFrames(project.value) && project.value.currentFrame >= project.value.settings.durationFrames) {
      project.value.currentFrame = project.value.settings.durationFrames - 1
    }
  }

  function canvasTransform(width: number, height: number): Transform {
    return {
      ...DEFAULT_TRANSFORM,
      x: project.value.settings.width / 2,
      y: project.value.settings.height / 2,
      width,
      height,
    }
  }

  function snapshot(): string { return JSON.stringify(serializeProject(project.value)) }
  function restoreSnapshot(serialized: string): void {
    revokeMaterialUrls(project.value)
    project.value = normalizeProject(JSON.parse(serialized) as EditorProject)
    selectedClipIds.value = []
    selectedTrackId.value = ''
    void hydrateMaterialUrls()
  }
  function commit(): void { past.value.push(snapshot()); if (past.value.length > 100) past.value.shift(); future.value = [] }
  function touch(): void { project.value.updatedAt = Date.now() }
  function selectTrack(id: string): void { selectedTrackId.value = id }
  function selectClip(id: string, additive = false): void {
    selectedClipIds.value = !id ? [] : additive ? [...new Set([...selectedClipIds.value, id])] : [id]
    const clip = id ? project.value.clips.find((item) => item.id === id) : undefined
    if (clip) selectedTrackId.value = clip.trackId
  }
  function selectClips(ids: string[], additive = false): void {
    selectedClipIds.value = additive ? [...new Set([...selectedClipIds.value, ...ids])] : ids
    const last = ids.at(-1)
    const clip = last ? project.value.clips.find((item) => item.id === last) : undefined
    if (clip) selectedTrackId.value = clip.trackId
  }
  function setCurrentFrame(frame: number): void { project.value.currentFrame = Math.min(project.value.settings.durationFrames - 1, Math.max(0, Math.round(frame))) }
  function materialTrack(type: ClipType): TimelineTrack { return project.value.tracks.find((track) => trackAccepts(track, type)) ?? project.value.tracks[0] }

  function revokeMaterialUrls(target: EditorProject): void {
    target.materials.forEach((material) => { if (material.objectUrl) URL.revokeObjectURL(material.objectUrl) })
  }

  function replaceProject(next: EditorProject): void {
    revokeMaterialUrls(project.value)
    project.value = normalizeProject(next)
    selectedClipIds.value = []
    selectedTrackId.value = ''
    past.value = []
    future.value = []
    clipboard.value = []
  }

  async function refreshSummaries(): Promise<void> {
    const list = await projectStorage.list()
    thumbnailUrls.forEach((url) => URL.revokeObjectURL(url))
    thumbnailUrls.clear()
    summaries.value = await Promise.all(list.map(async (item) => {
      const blob = await projectStorage.getThumbnail(item.id)
      const thumbnailUrl = blob ? URL.createObjectURL(blob) : undefined
      if (thumbnailUrl) thumbnailUrls.set(item.id, thumbnailUrl)
      return { ...item, thumbnailUrl }
    }))
    trashSummaries.value = await projectStorage.listTrash()
    quota.value = await projectStorage.quota()
  }

  async function saveNow(): Promise<void> {
    persist.cancel()
    await projectStorage.save(serializeProject(project.value))
    projectStorage.setActiveId(project.value.id)
  }

  async function updateThumbnail(): Promise<void> {
    const snapshot = cloneProject(project.value)
    try {
      const blob = await captureProjectThumbnail(snapshot)
      if (project.value.id !== snapshot.id) return
      await projectStorage.saveThumbnail(snapshot.id, blob)
      await refreshSummaries()
    } catch {
      if (project.value.id === snapshot.id) await refreshSummaries()
    }
  }

  async function initialize(): Promise<void> {
    try {
      const loaded = await projectStorage.bootstrap()
      replaceProject(loaded)
      await hydrateMaterialUrls()
      growTimeline()
      ready.value = true
      await refreshSummaries()
      void updateThumbnail()
    } catch (reason) {
      notify.push('error', reason instanceof Error ? reason.message : '项目加载失败')
      ready.value = true
    }
  }

  async function newProject(): Promise<void> {
    if (!ready.value) return
    await saveNow()
    persistThumbnail.cancel()
    const next = createEmptyProject()
    replaceProject(next)
    await projectStorage.save(next)
    projectStorage.setActiveId(next.id)
    await refreshSummaries()
    void updateThumbnail()
  }

  async function openProject(id: string): Promise<void> {
    if (!ready.value || id === project.value.id) return
    await saveNow()
    persistThumbnail.cancel()
    const next = await projectStorage.load(id)
    replaceProject(next)
    projectStorage.setActiveId(id)
    await hydrateMaterialUrls()
    growTimeline()
    await refreshSummaries()
    void updateThumbnail()
  }

  async function trashProject(id: string): Promise<void> {
    if (!ready.value) return
    const isCurrent = id === project.value.id
    const materialIds = isCurrent ? project.value.materials.map((item) => item.id) : (await projectStorage.load(id)).materials.map((item) => item.id)
    if (!isCurrent) await saveNow()
    persist.cancel()
    persistThumbnail.cancel()
    await projectStorage.trashProject(id, materialIds)
    notify.push('info', '项目已移入回收站，可随时恢复')
    if (isCurrent) {
      const remaining = (await projectStorage.list()).filter((item) => item.id !== id)
      if (remaining[0]) {
        const next = await projectStorage.load(remaining[0].id)
        replaceProject(next)
        projectStorage.setActiveId(next.id)
        await hydrateMaterialUrls()
        growTimeline()
      } else {
        const next = createEmptyProject()
        replaceProject(next)
        await projectStorage.save(next)
        projectStorage.setActiveId(next.id)
      }
    }
    await refreshSummaries()
    if (isCurrent) void updateThumbnail()
  }

  async function restoreProject(id: string): Promise<void> {
    const restored = await projectStorage.restoreProject(id)
    notify.push('success', `已恢复「${restored.name}」`)
    await refreshSummaries()
  }

  async function purgeProject(id: string): Promise<void> {
    await projectStorage.purgeProject(id)
    notify.push('warn', '项目已永久删除')
    await refreshSummaries()
  }

  async function renameProject(id: string, name: string): Promise<void> {
    const nextName = name.trim() || '未命名项目'
    if (id === project.value.id) { project.value.name = nextName; touch(); return }
    const loaded = await projectStorage.load(id)
    loaded.name = nextName
    loaded.updatedAt = Date.now()
    await projectStorage.save(loaded)
    await refreshSummaries()
  }

  async function deleteProject(id: string): Promise<void> {
    await trashProject(id)
  }

  async function addMaterial(file: File): Promise<Material> {
    const meta = await inspectMediaFile(file, project.value.settings.fps)
    if (isLargeMediaFile(file)) notify.push('warn', `「${file.name}」体积较大，预览和导出会占用较多内存`)
    commit()
    const material: Material = {
      id: nanoid(),
      type: meta.type,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      width: meta.width,
      height: meta.height,
      durationFrames: meta.durationFrames,
      objectUrl: URL.createObjectURL(file),
      missing: false,
    }
    project.value.materials.push(material); touch(); await materialStorage.save(material, file, project.value.id)
    quota.value = await projectStorage.quota()
    if (quota.value.quota && quota.value.usage / quota.value.quota > 0.85) notify.push('warn', '本地存储即将用尽，建议清理回收站或素材')
    return material
  }

  async function removeMaterial(id: string): Promise<void> {
    const material = project.value.materials.find((item) => item.id === id)
    if (!material) return
    commit()
    const used = project.value.clips.filter((clip) => clip.materialId === id).length
    project.value.clips = project.value.clips.filter((clip) => clip.materialId !== id)
    selectedClipIds.value = selectedClipIds.value.filter((clipId) => project.value.clips.some((clip) => clip.id === clipId))
    if (material.objectUrl) URL.revokeObjectURL(material.objectUrl)
    project.value.materials = project.value.materials.filter((item) => item.id !== id)
    touch()
    quota.value = await projectStorage.quota()
    notify.push(used ? 'info' : 'success', used ? `已删除「${material.name}」及其 ${used} 个时间轴片段` : `已删除素材「${material.name}」`)
  }

  async function relinkMaterial(id: string, file: File): Promise<void> {
    const material = project.value.materials.find((item) => item.id === id)
    if (!material) return
    const type = materialTypeOf(file)
    if (type !== material.type) throw new Error(`请选择${material.type === 'video' ? '视频' : material.type === 'audio' ? '音频' : '图片'}文件`)
    commit()
    const meta = await inspectMediaFile(file, project.value.settings.fps)
    if (material.objectUrl) URL.revokeObjectURL(material.objectUrl)
    material.name = file.name
    material.mimeType = file.type
    material.size = file.size
    material.width = meta.width
    material.height = meta.height
    material.durationFrames = meta.durationFrames
    material.objectUrl = URL.createObjectURL(file)
    material.missing = false
    project.value.clips.filter((clip) => clip.materialId === id).forEach((clip) => {
      Object.assign(clip, clampClipTiming(project.value, clip, {}))
    })
    touch()
    await materialStorage.save(material, file, project.value.id)
    notify.push('success', `已重新关联「${material.name}」`)
  }

  async function hydrateMaterialUrls(): Promise<void> {
    await Promise.all(project.value.materials.map(async (material) => {
      if (material.objectUrl) return
      material.objectUrl = await materialStorage.getObjectUrl(material.id)
      material.missing = !material.objectUrl
    }))
    const lost = project.value.materials.filter((item) => item.missing)
    if (lost.length) notify.push('error', `${lost.length} 个素材无法从本地读取，相关片段将显示占位`)
  }

  function addTrack(type: ClipType | TrackType, afterOrder?: number): TimelineTrack {
    commit()
    const track = createTrack(project.value, type, afterOrder)
    touch()
    return track
  }

  function toggleTrackLock(id: string): void {
    const track = project.value.tracks.find((item) => item.id === id)
    if (!track) return
    commit()
    track.locked = !track.locked
    touch()
  }

  function toggleTrackHidden(id: string): void {
    const track = project.value.tracks.find((item) => item.id === id)
    if (!track) return
    commit()
    track.hidden = !track.hidden
    touch()
  }

  function toggleTrackMuted(id: string): void {
    const track = project.value.tracks.find((item) => item.id === id)
    if (!track) return
    commit()
    track.muted = !track.muted
    touch()
  }

  function removeTrack(id: string): void {
    if (!canRemoveTrack(project.value, id)) { notify.push('warn', '只能删除空的额外轨道'); return }
    commit()
    project.value.tracks = project.value.tracks.filter((track) => track.id !== id)
    touch()
  }

  function placeOnTrack(type: ClipType, startFrame: number, durationFrames: number, targetTrackId?: string, spawnTrack = false, afterOrder?: number): TimelineTrack {
    if (spawnTrack || targetTrackId === 'new') return createTrack(project.value, type, afterOrder)
    if (targetTrackId) {
      const candidate = project.value.tracks.find((item) => item.id === targetTrackId)
      if (candidate?.locked) throw new Error('轨道已锁定')
      if (candidate && trackAccepts(candidate, type)) {
        if (trackWouldOverlap(project.value, candidate.id, [{ startFrame, durationFrames }])) return createTrack(project.value, type, candidate.order)
        return candidate
      }
      return createTrack(project.value, type, candidate?.order)
    }
    const existing = materialTrack(type)
    if (existing.locked || trackWouldOverlap(project.value, existing.id, [{ startFrame, durationFrames }])) return createTrack(project.value, type, existing.locked ? undefined : existing.order)
    return existing
  }

  function addClip(material: Material, startFrame = project.value.currentFrame, targetTrackId?: string, spawnTrack = false, afterOrder?: number): void {
    if (material.missing) { notify.push('error', `素材「${material.name}」已丢失，无法添加到时间轴`); return }
    const duration = material.type === 'image' ? project.value.settings.fps * 5 : material.durationFrames ?? project.value.settings.fps * 10
    try {
      commit()
      const track = placeOnTrack(material.type, startFrame, duration, targetTrackId, spawnTrack, afterOrder)
      if (track.locked) {
        past.value.pop()
        notify.push('warn', '轨道已锁定')
        return
      }
      const clip: TimelineClip = { id: nanoid(), trackId: track.id, type: material.type, materialId: material.id, startFrame, durationFrames: duration, offsetFrame: 0, name: material.name, zIndex: project.value.clips.length, locked: false, speed: 1, fadeInFrames: 0, fadeOutFrames: 0, transitionIn: { ...DEFAULT_TRANSITION }, transitionOut: { ...DEFAULT_TRANSITION }, filter: { ...DEFAULT_FILTER }, transform: canvasTransform(material.width ?? Math.round(project.value.settings.width / 2), material.height ?? Math.round(project.value.settings.height / 2)), audio: material.type === 'image' ? undefined : { ...DEFAULT_AUDIO } }
      project.value.clips.push(clip); selectClip(clip.id); growTimeline(); touch()
    } catch (reason) {
      past.value.pop()
      notify.push('warn', reason instanceof Error ? reason.message : '无法添加到时间轴')
    }
  }

  function addText(): void {
    commit()
    const duration = project.value.settings.fps * 5
    const track = placeOnTrack('text', project.value.currentFrame, duration)
    const text: TextConfig = createDefaultText()
    const clip: TimelineClip = { id: nanoid(), trackId: track.id, type: 'text', startFrame: project.value.currentFrame, durationFrames: duration, offsetFrame: 0, name: text.content, zIndex: project.value.clips.length, locked: false, speed: 1, fadeInFrames: 0, fadeOutFrames: 0, transitionIn: { ...DEFAULT_TRANSITION }, transitionOut: { ...DEFAULT_TRANSITION }, filter: { ...DEFAULT_FILTER }, transform: canvasTransform(700, 150), text }
    project.value.clips.push(clip); selectClip(clip.id); growTimeline(); touch()
  }

  function applyTrackDrop(ids: string[], type: ClipType, hint: TrackDropHint): void {
    const clips = movingClips(project.value, ids, type)
    if (!clips.length) return
    if (hint.kind === 'blocked') { notify.push('warn', '轨道已锁定'); return }
    let track: TimelineTrack | undefined
    if (hint.kind === 'onto') {
      const candidate = project.value.tracks.find((item) => item.id === hint.trackId)
      if (!candidate || candidate.locked) { notify.push('warn', '轨道已锁定'); return }
      track = trackWouldOverlap(project.value, candidate.id, clips, clips.map((clip) => clip.id))
        ? createTrack(project.value, type, candidate.order)
        : candidate
    } else {
      track = createTrack(project.value, type, hint.kind === 'insert' ? hint.afterOrder : undefined)
    }
    clips.forEach((clip) => { clip.trackId = track!.id })
    growTimeline()
    touch()
  }

  function updateTransform(id: string, patch: Partial<Transform>, record = false): void { if (record) commit(); if (!isClipInteractable(project.value, id)) return; const clip = project.value.clips.find((item) => item.id === id); if (!clip) return; Object.assign(clip.transform, patch); touch() }
  function updateText(id: string, patch: Partial<TextConfig>, record = false): void {
    const clip = project.value.clips.find((item) => item.id === id)
    if (!clip?.text || !isClipInteractable(project.value, id)) return
    if (record) commit()
    Object.assign(clip.text, patch); if (patch.content) clip.name = patch.content; touch()
  }
  function updateClipTiming(id: string, patch: Pick<Partial<TimelineClip>, 'startFrame' | 'durationFrames' | 'offsetFrame'>, record = false): void {
    const clip = project.value.clips.find((item) => item.id === id)
    if (!clip || !isClipInteractable(project.value, id)) return
    if (record) commit()
    Object.assign(clip, clampClipTiming(project.value, clip, patch))
    growTimeline()
    touch()
  }
  function updateClipName(id: string, name: string): void {
    const clip = project.value.clips.find((item) => item.id === id)
    if (!clip || !isClipInteractable(project.value, id)) return
    clip.name = name
    touch()
  }
  function updateSettings(patch: Partial<ProjectSettings>): void {
    commit()
    if (patch.fps && patch.fps !== project.value.settings.fps) rescaleProjectFps(project.value, patch.fps)
    if (patch.width != null || patch.height != null) {
      applyCanvasSize(project.value, patch.width ?? project.value.settings.width, patch.height ?? project.value.settings.height)
    }
    if (patch.durationFrames != null) {
      const next = clampDurationFrames(project.value, patch.durationFrames)
      if (next > patch.durationFrames) notify.push('warn', '时间轴不能短于现有片段')
      project.value.settings.durationFrames = next
    }
    setCurrentFrame(project.value.currentFrame)
    touch()
  }
  function applyCanvasPreset(id: CanvasPresetId): boolean {
    const preset = CANVAS_PRESETS.find((item) => item.id === id)
    if (!preset) return false
    if (project.value.settings.width === preset.width && project.value.settings.height === preset.height) return false
    commit()
    applyCanvasSize(project.value, preset.width, preset.height)
    touch()
    notify.push('success', `画布已切换为 ${preset.label} · ${preset.width}×${preset.height}`)
    return true
  }
  function updateClipSpeed(id: string, speed: number): void {
    const clip = project.value.clips.find((item) => item.id === id)
    if (!clip || !isClipInteractable(project.value, id) || clip.type === 'text' || clip.type === 'image') return
    commit()
    const used = clip.durationFrames * clipSpeed(clip)
    clip.speed = clipSpeed({ speed })
    Object.assign(clip, clampClipTiming(project.value, clip, { durationFrames: durationForSpeed(used, clip.speed) }))
    growTimeline()
    touch()
  }
  function updateClipFade(id: string, patch: Partial<Pick<TimelineClip, 'fadeInFrames' | 'fadeOutFrames'>>): void {
    const clip = project.value.clips.find((item) => item.id === id)
    if (!clip || !isClipInteractable(project.value, id)) return
    commit()
    if (patch.fadeInFrames != null) {
      clip.fadeInFrames = Math.max(0, Math.round(patch.fadeInFrames))
      clip.transitionIn = clip.fadeInFrames > 0 ? { kind: 'fade', durationFrames: clip.fadeInFrames } : { ...DEFAULT_TRANSITION }
    }
    if (patch.fadeOutFrames != null) {
      clip.fadeOutFrames = Math.max(0, Math.round(patch.fadeOutFrames))
      clip.transitionOut = clip.fadeOutFrames > 0 ? { kind: 'fade', durationFrames: clip.fadeOutFrames } : { ...DEFAULT_TRANSITION }
    }
    touch()
  }
  function updateClipTransition(id: string, side: 'in' | 'out', patch: { kind?: ClipTransitionKind; durationFrames?: number }): void {
    const clip = project.value.clips.find((item) => item.id === id)
    if (!clip || !isClipInteractable(project.value, id) || clip.type === 'audio') return
    commit()
    const current = side === 'in' ? clip.transitionIn : clip.transitionOut
    const resolved = resolvedTransition(clip, side)
    const kind = patch.kind ?? resolved.kind
    const fallback = kind === 'none' ? DEFAULT_TRANSITION.durationFrames : Math.max(1, current?.durationFrames || resolved.durationFrames || Math.round(project.value.settings.fps * 0.4))
    const durationFrames = Math.max(0, Math.min(clip.durationFrames, Math.round(patch.durationFrames ?? fallback)))
    const next = { kind, durationFrames: kind === 'none' ? Math.max(1, durationFrames || DEFAULT_TRANSITION.durationFrames) : Math.max(1, durationFrames) }
    if (side === 'in') {
      clip.transitionIn = next
      clip.fadeInFrames = kind === 'fade' ? next.durationFrames : 0
    } else {
      clip.transitionOut = next
      clip.fadeOutFrames = kind === 'fade' ? next.durationFrames : 0
    }
    touch()
  }
  function updateClipFilter(id: string, patch: Partial<ClipFilter>): void {
    const clip = project.value.clips.find((item) => item.id === id)
    if (!clip || !isClipInteractable(project.value, id)) return
    commit()
    clip.filter = { ...DEFAULT_FILTER, ...clip.filter, ...patch }
    touch()
  }
  function toggleRippleEdit(): void {
    commit()
    project.value.settings.rippleEdit = !(project.value.settings.rippleEdit ?? true)
    touch()
  }
  function updateAudio(id: string, patch: Partial<NonNullable<TimelineClip['audio']>>): void {
    const clip = project.value.clips.find((item) => item.id === id)
    if (!clip || !isClipInteractable(project.value, id)) return
    commit()
    clip.audio = { ...DEFAULT_AUDIO, ...clip.audio, ...patch }
    touch()
  }
  function alignSelected(mode: AlignMode): void {
    const clips = project.value.clips.filter((clip) => selectedClipIds.value.includes(clip.id) && isClipInteractable(project.value, clip.id))
    if (clips.length < 2) return
    commit()
    alignedPositions(clips, mode).forEach((point, id) => updateTransform(id, point))
  }
  function removableSelected(): TimelineClip[] {
    return selectedClips().filter((clip) => isClipInteractable(project.value, clip.id))
  }
  function removeSelected(): void {
    const clips = removableSelected()
    if (!clips.length) {
      if (selectedClipIds.value.length) notify.push('warn', '锁定的片段不能删除')
      return
    }
    commit()
    if (project.value.settings.rippleEdit !== false) rippleRemove(project.value, clips)
    else {
      const ids = new Set(clips.map((clip) => clip.id))
      project.value.clips = project.value.clips.filter((clip) => !ids.has(clip.id))
    }
    const ids = new Set(clips.map((clip) => clip.id))
    selectedClipIds.value = selectedClipIds.value.filter((id) => !ids.has(id))
    touch()
  }
  function toggleLock(id: string): void { const clip = project.value.clips.find((item) => item.id === id); if (!clip) return; commit(); clip.locked = !clip.locked; touch() }
  function moveSelectedLayer(direction: 'front' | 'back' | 'forward' | 'backward'): void {
    const movable = selectedClipIds.value.filter((id) => isClipInteractable(project.value, id))
    if (!movable.length) {
      if (selectedClipIds.value.length) notify.push('warn', '锁定的片段不能调整图层')
      return
    }
    commit(); const selected = new Set(movable); const ordered = [...project.value.clips].sort((a, b) => a.zIndex - b.zIndex)
    if (direction === 'front') ordered.sort((a, b) => Number(selected.has(a.id)) - Number(selected.has(b.id)))
    if (direction === 'back') ordered.sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)))
    if (direction === 'forward') for (let index = ordered.length - 2; index >= 0; index -= 1) if (selected.has(ordered[index].id) && !selected.has(ordered[index + 1].id)) [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]]
    if (direction === 'backward') for (let index = 1; index < ordered.length; index += 1) if (selected.has(ordered[index].id) && !selected.has(ordered[index - 1].id)) [ordered[index], ordered[index - 1]] = [ordered[index - 1], ordered[index]]
    ordered.forEach((clip, index) => { clip.zIndex = index }); touch()
  }
  function selectAllClips(): void { selectedClipIds.value = project.value.clips.map((clip) => clip.id) }
  function selectedClips(): TimelineClip[] {
    return project.value.clips.filter((clip) => selectedClipIds.value.includes(clip.id))
  }
  function copySelected(): boolean {
    const clips = selectedClips()
    if (!clips.length) { notify.push('warn', '请先选择要复制的片段'); return false }
    clipboard.value = clips.map((clip) => cloneData(clip))
    notify.push('success', clips.length === 1 ? `已复制「${clips[0].name}」` : `已复制 ${clips.length} 个片段`)
    return true
  }
  function resolvePasteTrack(clip: TimelineClip, ranges: Array<{ startFrame: number; durationFrames: number }>, preferredTrackId?: string): TimelineTrack {
    const preferred = preferredTrackId ? project.value.tracks.find((track) => track.id === preferredTrackId) : undefined
    const original = project.value.tracks.find((track) => track.id === clip.trackId)
    const candidate = preferred && trackAccepts(preferred, clip.type) ? preferred : original && trackAccepts(original, clip.type) ? original : undefined
    if (candidate && !candidate.locked && !trackWouldOverlap(project.value, candidate.id, ranges)) return candidate
    const fit = sortedTracks(project.value).find((track) => trackAccepts(track, clip.type) && !track.locked && !trackWouldOverlap(project.value, track.id, ranges))
    if (fit) return fit
    return createTrack(project.value, clip.type)
  }
  function pasteAtFrame(frame = project.value.currentFrame, trackId?: string): boolean {
    if (!clipboard.value.length) { notify.push('warn', '剪贴板为空，请先复制片段'); return false }
    commit()
    const earliest = Math.min(...clipboard.value.map((clip) => clip.startFrame))
    const groups = new Map<string, TimelineClip[]>()
    clipboard.value.forEach((clip) => {
      const list = groups.get(clip.trackId) ?? []
      list.push(clip)
      groups.set(clip.trackId, list)
    })
    const trackMap = new Map<string, string>()
    groups.forEach((group, originalTrackId) => {
      const ranges = group.map((clip) => ({ startFrame: Math.max(0, frame + clip.startFrame - earliest), durationFrames: clip.durationFrames }))
      const preferred = trackId && group.some((clip) => {
        const track = project.value.tracks.find((item) => item.id === trackId)
        return track ? trackAccepts(track, clip.type) : false
      }) ? trackId : undefined
      trackMap.set(originalTrackId, resolvePasteTrack(group[0], ranges, preferred).id)
    })
    const created = clipboard.value.map((clip, index) => {
      const startFrame = Math.max(0, frame + clip.startFrame - earliest)
      return { ...cloneData(clip), id: nanoid(), startFrame, trackId: trackMap.get(clip.trackId) ?? clip.trackId, zIndex: project.value.clips.length + index, locked: false }
    })
    project.value.clips.push(...created)
    selectedClipIds.value = created.map((clip) => clip.id)
    growTimeline()
    touch()
    notify.push('success', created.length === 1 ? `已粘贴「${created[0].name}」` : `已粘贴 ${created.length} 个片段`)
    return true
  }
  function pasteAtCurrentFrame(): boolean {
    return pasteAtFrame(project.value.currentFrame)
  }
  function cutSelected(): boolean {
    const clips = removableSelected()
    if (!clips.length) {
      notify.push('warn', selectedClipIds.value.length ? '锁定的片段不能剪切' : '请先选择要剪切的片段')
      return false
    }
    commit()
    clipboard.value = clips.map((clip) => cloneData(clip))
    if (project.value.settings.rippleEdit !== false) rippleRemove(project.value, clips)
    else {
      const ids = new Set(clips.map((clip) => clip.id))
      project.value.clips = project.value.clips.filter((clip) => !ids.has(clip.id))
    }
    selectedClipIds.value = []
    touch()
    notify.push('info', clips.length === 1 ? `已剪切「${clips[0].name}」` : `已剪切 ${clips.length} 个片段`)
    return true
  }
  function duplicateSelected(): boolean {
    const clips = selectedClips()
    if (!clips.length) { notify.push('warn', '请先选择要复制的片段'); return false }
    const previous = clipboard.value
    clipboard.value = clips.map((clip) => cloneData(clip))
    const end = Math.max(...clips.map((clip) => clip.startFrame + clip.durationFrames))
    const ok = pasteAtFrame(end)
    clipboard.value = previous
    return ok
  }
  function clipsAtPlayhead(): TimelineClip[] {
    const frame = project.value.currentFrame
    const onClip = (clip: TimelineClip) => (
      isClipInteractable(project.value, clip.id)
      && frame > clip.startFrame
      && frame < clip.startFrame + clip.durationFrames
    )
    const selected = selectedClips().filter(onClip)
    return selected.length ? selected : project.value.clips.filter(onClip)
  }
  const canSplitAtPlayhead = computed(() => clipsAtPlayhead().length > 0)
  function splitClipAudio(clipId?: string): boolean {
    const id = clipId ?? selectedClipIds.value.at(-1)
    const clip = id ? project.value.clips.find((item) => item.id === id) : undefined
    if (!clip || !canDetachAudio(project.value, clip)) {
      notify.push('warn', '只能从未锁定的视频片段分离音频')
      return false
    }
    commit()
    const volume = clip.audio?.volume ?? 1
    clip.audio = { ...DEFAULT_AUDIO, ...clip.audio, muted: true }
    const track = placeOnTrack('audio', clip.startFrame, clip.durationFrames)
    const audioClip: TimelineClip = {
      id: nanoid(),
      trackId: track.id,
      type: 'audio',
      materialId: clip.materialId,
      startFrame: clip.startFrame,
      durationFrames: clip.durationFrames,
      offsetFrame: clip.offsetFrame,
      name: `「${clip.name}」音频`,
      zIndex: project.value.clips.length,
      locked: false,
      speed: clip.speed ?? 1,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      transform: { ...DEFAULT_TRANSFORM },
      audio: { volume, muted: false, fadeInFrames: clip.audio?.fadeInFrames ?? 0, fadeOutFrames: clip.audio?.fadeOutFrames ?? 0 },
    }
    project.value.clips.push(audioClip)
    selectClip(audioClip.id)
    growTimeline()
    touch()
    notify.push('success', `已分离「${clip.name}」的音频`)
    return true
  }
  function splitSelectedAtPlayhead(): boolean {
    const frame = project.value.currentFrame
    const targets = clipsAtPlayhead().filter((clip) => {
      const source = sourceLength(project.value, clip)
      const rightOffset = clip.offsetFrame + (frame - clip.startFrame) * clipSpeed(clip)
      return source == null || rightOffset < source
    })
    if (!targets.length) {
      notify.push('warn', '请把播放头放在未锁定片段的中间再分割')
      return false
    }
    commit()
    const created: string[] = []
    targets.forEach((clip) => {
      const leftDuration = frame - clip.startFrame
      const rightDuration = clip.durationFrames - leftDuration
      const rightOffset = clip.offsetFrame + leftDuration * clipSpeed(clip)
      clip.durationFrames = leftDuration
      project.value.clips.push({
        ...cloneData(clip),
        id: nanoid(),
        startFrame: frame,
        durationFrames: rightDuration,
        offsetFrame: clip.type === 'video' || clip.type === 'audio' ? rightOffset : 0,
        zIndex: project.value.clips.length,
        locked: false,
      })
      created.push(project.value.clips.at(-1)!.id)
    })
    selectedClipIds.value = created
    growTimeline()
    touch()
    notify.push('success', created.length === 1 ? '已在播放头处分割' : `已分割 ${created.length} 个片段`)
    return true
  }
  function splitSelectedSide(side: 'left' | 'right'): boolean {
    try {
      const frame = project.value.currentFrame
      const targets = clipsAtPlayhead()
      if (!targets.length) {
        notify.push('warn', '请把播放头放在片段中间，再点左分割 [ 或右分割 ]')
        return false
      }
      commit()
      const ripple = project.value.settings.rippleEdit !== false
      targets.forEach((clip) => {
        if (side === 'left') {
          const oldStart = clip.startFrame
          Object.assign(clip, trimLeftTo(project.value, clip, frame))
          const removed = clip.startFrame - oldStart
          if (ripple && removed > 0) rippleShift(project.value, clip.trackId, clip.startFrame, -removed)
          return
        }
        const oldEnd = clip.startFrame + clip.durationFrames
        Object.assign(clip, trimRightTo(project.value, clip, frame))
        const removed = oldEnd - (clip.startFrame + clip.durationFrames)
        if (ripple && removed > 0) rippleShift(project.value, clip.trackId, clip.startFrame + clip.durationFrames, -removed, [clip.id])
      })
      touch()
      notify.push('success', targets.length === 1
        ? (side === 'left' ? '已去掉播放头左侧' : '已去掉播放头右侧')
        : (side === 'left' ? `已去掉 ${targets.length} 个片段的左侧` : `已去掉 ${targets.length} 个片段的右侧`))
      return true
    } catch (reason) {
      notify.push('error', reason instanceof Error ? reason.message : '分割失败')
      return false
    }
  }
  function splitSelectedLeft(): boolean { return splitSelectedSide('left') }
  function splitSelectedRight(): boolean { return splitSelectedSide('right') }
  function undo(): void { const previous = past.value.pop(); if (!previous) return; future.value.push(snapshot()); restoreSnapshot(previous) }
  function redo(): void { const next = future.value.pop(); if (!next) return; past.value.push(snapshot()); restoreSnapshot(next) }

  const persist = useDebounceFn(async (value: EditorProject) => {
    if (!ready.value) return
    try { await projectStorage.save(serializeProject(value)) }
    catch (reason) { notify.push('error', reason instanceof Error ? reason.message : '自动保存失败') }
  }, 700, { maxWait: 3000 })
  const persistThumbnail = useDebounceFn(() => { if (ready.value) void updateThumbnail() }, 2500)

  watch(project, (value) => { persist(value); persistThumbnail() }, { deep: true })
  return {
    project, ready, summaries, trashSummaries, quota, recentProjects, missingMaterials, orderedTracks, contentFrames, selectedClipIds, selectedTrackId, pixelsPerFrame, activeClips, selectedClip, dragMaterialId, hasClipboard, canSplitAtPlayhead,
    initialize, newProject, openProject, deleteProject, trashProject, restoreProject, purgeProject, renameProject, refreshSummaries,
    addMaterial, removeMaterial, relinkMaterial, addClip, addText, addTrack, toggleTrackLock, toggleTrackHidden, toggleTrackMuted, removeTrack, applyTrackDrop, selectClip, selectClips, selectTrack, setCurrentFrame, updateTransform, updateText, updateClipTiming, updateClipName, updateSettings, applyCanvasPreset, updateAudio, updateClipSpeed, updateClipFade, updateClipTransition, updateClipFilter, toggleRippleEdit, alignSelected,
    removeSelected, toggleLock, moveSelectedLayer, selectAllClips, copySelected, cutSelected, pasteAtFrame, pasteAtCurrentFrame, duplicateSelected, splitClipAudio, splitSelectedAtPlayhead, splitSelectedLeft, splitSelectedRight, undo, redo, commit, hydrateMaterialUrls,
  }
})
