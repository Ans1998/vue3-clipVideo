<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TransformControls from '@/components/preview/TransformControls.vue'
import { PlaybackController } from '@/services/playback/PlaybackController'
import { PreviewAudioMixer } from '@/services/playback/PreviewAudio'
import { bindPreviewPlayback, setPreviewPlaying } from '@/services/playback/registry'
import { CanvasSceneRenderer, resolveActiveClips, sourceFrame, type SceneSource } from '@/services/renderer/SceneRenderer'
import { mediaCacheKey } from '@/services/renderer/MaterialAssetLoader'
import { useEditorStore } from '@/stores/editor'
import type { TimelineClip, Transform } from '@/types/editor'
import { angleBetween, normalizeDegrees, rotatePoint, type Point } from '@/utils/scene/geometry'
import { snappedGroupDelta, type AlignmentGuide } from '@/utils/scene/snapping'
import { boundsToTransform, clipAabb, normalizeRect, rectsIntersect, selectionBounds } from '@/utils/scene/bounds'
import { seekMediaToFrame } from '@/utils/media/seek'
import { clipSpeed } from '@/utils/timeline/clipPlayback'
import { isClipInteractable } from '@/utils/timeline/tracks'
import { groupResizePatches } from '@/utils/scene/groupResize'
import { isTypingTarget } from '@/utils/dom'
import { selectionOverlayFrame } from '@/utils/scene/selectionOverlay'
import { CANVAS_PRESETS, fitCanvasZoom, matchingCanvasPreset, type CanvasPresetId } from '@/utils/scene/canvas'
import { playbackContentRange } from '@/utils/timeline/exportRange'
import { frameToTimecode } from '@/utils/timeline/timecode'
import UiIcon from '@/components/layout/UiIcon.vue'
import UiTooltip from '@/components/layout/UiTooltip.vue'

type Interaction =
  | { kind: 'drag'; ids: string[]; origin: Point; starts: Array<{ id: string; x: number; y: number }> }
  | { kind: 'resize'; id: string; handle: string; start: Point; transform: Transform }
  | { kind: 'group-resize'; handle: string; start: Point; bounds: Transform; starts: Array<{ id: string; transform: Transform }> }
  | { kind: 'rotate'; id: string; startAngle: number; rotation: number }
  | { kind: 'marquee'; start: Point; current: Point }

const props = withDefaults(defineProps<{ expanded?: boolean }>(), { expanded: false })
const emit = defineEmits<{ toggleExpand: [] }>()
const editor = useEditorStore()
const canvas = ref<HTMLCanvasElement>()
const stage = ref<HTMLElement>()
const zoom = ref(0.48)
const autoFit = ref(true)
const isPlaying = ref(false)
const media = new Map<string, SceneSource>()
const guides = ref<AlignmentGuide[]>([])
const marquee = ref<{ left: number; top: number; width: number; height: number } | null>(null)
const textEdit = ref<{ id: string; value: string } | null>(null)
const renderer = new CanvasSceneRenderer()
const audio = new PreviewAudioMixer()
let animation = 0
let interaction: Interaction | null = null
let unbindPlayback = (): void => undefined
let stageObserver: ResizeObserver | undefined
const playback = new PlaybackController({
  fps: () => editor.project.settings.fps,
  currentFrame: () => editor.project.currentFrame,
  startFrame: () => playbackContentRange(editor.project).startFrame,
  durationFrames: () => playbackContentRange(editor.project).endFrame,
  setCurrentFrame: (frame) => editor.setCurrentFrame(frame),
  onFrame: () => { syncVideoFrames(); void audio.sync(editor.project, editor.project.currentFrame, true); queueDraw() },
  onPlayState: (playing) => { isPlaying.value = playing; setPreviewPlaying(playing); syncVideoFrames(); void audio.sync(editor.project, editor.project.currentFrame, playing) },
})

const selected = computed(() => editor.selectedClip)
const selectedActive = computed(() => resolveActiveClips(editor.project, editor.project.currentFrame).filter((clip) => editor.selectedClipIds.includes(clip.id) && clip.type !== 'audio'))
const groupBounds = computed(() => selectedActive.value.length > 1 ? selectionBounds(selectedActive.value) : null)
const groupTransform = computed(() => groupBounds.value ? boundsToTransform(groupBounds.value) : null)
const activeSelectedTransform = computed(() => selectedActive.value.find((clip) => clip.id === selected.value?.id)?.transform)
const activeRatio = computed(() => matchingCanvasPreset(editor.project.settings.width, editor.project.settings.height))
const textEditFrame = computed(() => {
  if (!textEdit.value) return null
  const clip = editor.project.clips.find((item) => item.id === textEdit.value?.id)
  if (!clip) return null
  return selectionOverlayFrame(clip.transform, zoom.value, editor.project.settings.width, editor.project.settings.height)
})
function queueDraw(): void { cancelAnimationFrame(animation); animation = requestAnimationFrame(() => { void draw() }) }
async function draw(): Promise<void> {
  const element = canvas.value; if (!element) return
  const ctx = element.getContext('2d'); if (!ctx) return
  const { width, height } = editor.project.settings
  if (element.width !== width || element.height !== height) { element.width = width; element.height = height }
  await renderer.render(ctx, editor.project, editor.project.currentFrame, { get: (clip) => media.get(mediaCacheKey(clip) ?? '') })
}
async function loadMaterial(clip: TimelineClip): Promise<void> {
  const key = mediaCacheKey(clip)
  if (!key || media.has(key)) return
  const item = editor.project.materials.find((material) => material.id === clip.materialId); if (!item?.objectUrl) return
  if (item.type === 'image') { const image = new Image(); image.src = item.objectUrl; await image.decode(); media.set(key, image) }
  if (item.type === 'video') {
    const video = document.createElement('video'); video.src = item.objectUrl; video.muted = true; video.playsInline = true; video.preload = 'auto'
    await new Promise<void>((resolve) => video.addEventListener('loadeddata', () => resolve(), { once: true }))
    video.addEventListener('seeked', queueDraw); media.set(key, video)
  }
}
async function loadActiveMedia(): Promise<void> { await Promise.all(resolveActiveClips(editor.project, editor.project.currentFrame).map((clip) => clip.materialId ? loadMaterial(clip) : Promise.resolve())); syncVideoFrames(); queueDraw() }
function syncVideoFrames(): void {
  resolveActiveClips(editor.project, editor.project.currentFrame).forEach((clip) => {
    if (clip.type !== 'video' || !clip.materialId) return
    const video = media.get(mediaCacheKey(clip) ?? '')
    if (!(video instanceof HTMLVideoElement)) return
    video.playbackRate = clipSpeed(clip)
    const frame = sourceFrame(clip, editor.project.currentFrame)
    if (isPlaying.value) {
      const targetTime = frame / editor.project.settings.fps
      if (Math.abs(video.currentTime - targetTime) > 2 / editor.project.settings.fps) void seekMediaToFrame(video, frame, editor.project.settings.fps)
      if (video.paused) void video.play().catch(() => undefined)
    } else void seekMediaToFrame(video, frame, editor.project.settings.fps)
  })
  if (!isPlaying.value) media.forEach((source) => { if (source instanceof HTMLVideoElement && !source.paused) source.pause() })
}
function projectPoint(event: PointerEvent): Point | null { const box = canvas.value?.getBoundingClientRect(); if (!box) return null; return { x: (event.clientX - box.left) * editor.project.settings.width / box.width, y: (event.clientY - box.top) * editor.project.settings.height / box.height } }
function toLocal(point: Point, transform: Transform): Point { return rotatePoint({ x: point.x - transform.x, y: point.y - transform.y }, -transform.rotation) }
function hitTest(x: number, y: number): TimelineClip | undefined { return [...resolveActiveClips(editor.project, editor.project.currentFrame)].reverse().find((clip) => { if (clip.type === 'audio') return false; const local = toLocal({ x, y }, clip.transform); const t = clip.transform; return Math.abs(local.x) <= t.width * t.scaleX / 2 && Math.abs(local.y) <= t.height * t.scaleY / 2 }) }
function pointerDown(event: PointerEvent): void {
  const point = projectPoint(event); if (!point) return
  const clip = hitTest(point.x, point.y)
  if (!clip) { if (!(event.ctrlKey || event.shiftKey)) editor.selectClip(''); interaction = { kind: 'marquee', start: point, current: point }; canvas.value?.setPointerCapture(event.pointerId); return }
  editor.selectClip(clip.id, event.ctrlKey || event.shiftKey || editor.selectedClipIds.includes(clip.id))
  if (!isClipInteractable(editor.project, clip.id)) return
  editor.commit()
  const ids = editor.selectedClipIds.filter((id) => isClipInteractable(editor.project, id))
  interaction = { kind: 'drag', ids, origin: point, starts: ids.map((id) => { const item = editor.project.clips.find((clipItem) => clipItem.id === id)!; return { id, x: item.transform.x, y: item.transform.y } }) }
  canvas.value?.setPointerCapture(event.pointerId)
}
function controlDown(event: PointerEvent, handle: string): void {
  const point = projectPoint(event); if (!point) return
  event.stopPropagation(); editor.commit(); canvas.value?.setPointerCapture(event.pointerId)
  if (groupTransform.value && selectedActive.value.length > 1 && handle !== 'rotate') {
    interaction = { kind: 'group-resize', handle, start: point, bounds: { ...groupTransform.value }, starts: selectedActive.value.map((clip) => ({ id: clip.id, transform: { ...clip.transform } })) }
    return
  }
  const clip = selected.value; if (!clip || !isClipInteractable(editor.project, clip.id)) return
  interaction = handle === 'rotate' ? { kind: 'rotate', id: clip.id, startAngle: angleBetween({ x: clip.transform.x, y: clip.transform.y }, point), rotation: clip.transform.rotation } : { kind: 'resize', id: clip.id, handle, start: toLocal(point, clip.transform), transform: { ...clip.transform } }
}
function resizeSingle(operation: Extract<Interaction, { kind: 'resize' }>, point: Point, keepRatio: boolean): void {
  const original = operation.transform; const current = toLocal(point, original); const delta = { x: current.x - operation.start.x, y: current.y - operation.start.y }; const affectsX = /e|w/.test(operation.handle); const affectsY = /n|s/.test(operation.handle)
  let renderedWidth = original.width * original.scaleX; let renderedHeight = original.height * original.scaleY; let shiftX = 0; let shiftY = 0
  if (affectsX) { renderedWidth = Math.max(24, renderedWidth + (operation.handle.includes('w') ? -delta.x : delta.x)); shiftX = delta.x / 2 }
  if (affectsY) { renderedHeight = Math.max(24, renderedHeight + (operation.handle.includes('n') ? -delta.y : delta.y)); shiftY = delta.y / 2 }
  if (keepRatio && (affectsX || affectsY)) { const ratio = original.width / original.height; if (affectsX && !affectsY) renderedHeight = renderedWidth / ratio; else if (affectsY && !affectsX) renderedWidth = renderedHeight * ratio; else if (Math.abs(delta.x) > Math.abs(delta.y)) renderedHeight = renderedWidth / ratio; else renderedWidth = renderedHeight * ratio }
  const shift = rotatePoint({ x: shiftX, y: shiftY }, original.rotation); editor.updateTransform(operation.id, { x: Math.round(original.x + shift.x), y: Math.round(original.y + shift.y), width: Math.round(renderedWidth / original.scaleX), height: Math.round(renderedHeight / original.scaleY) }); queueDraw()
}
function pointerMove(event: PointerEvent): void {
  if (!interaction) return; const point = projectPoint(event); if (!point) return
  if (interaction.kind === 'marquee') {
    interaction.current = point
    const box = normalizeRect(interaction.start, point)
    marquee.value = { left: box.x * zoom.value, top: box.y * zoom.value, width: box.width * zoom.value, height: box.height * zoom.value }
    return
  }
  if (interaction.kind === 'drag') {
    const operation = interaction
    const dx = point.x - operation.origin.x
    const dy = point.y - operation.origin.y
    const leader = editor.project.clips.find((item) => item.id === operation.starts[0]?.id)
    if (!leader) return
    const snapped = snappedGroupDelta(
      operation.starts,
      dx,
      dy,
      leader.transform,
      editor.project.settings,
      resolveActiveClips(editor.project, editor.project.currentFrame).filter((item) => !operation.starts.some((start) => start.id === item.id)),
    )
    guides.value = snapped.guides
    operation.starts.forEach((item) => editor.updateTransform(item.id, { x: Math.round(item.x + snapped.x), y: Math.round(item.y + snapped.y) }))
    queueDraw()
  }
  if (interaction.kind === 'resize') resizeSingle(interaction, point, event.shiftKey)
  if (interaction.kind === 'group-resize') {
    groupResizePatches(interaction.starts, interaction.bounds, interaction.handle, point, event.shiftKey).forEach((item) => editor.updateTransform(item.id, item.patch))
    queueDraw()
  }
  if (interaction.kind === 'rotate') {
    const operation = interaction
    const clip = editor.project.clips.find((item) => item.id === operation.id)
    if (!clip) return
    const rotation = operation.rotation + angleBetween({ x: clip.transform.x, y: clip.transform.y }, point) - operation.startAngle
    editor.updateTransform(clip.id, { rotation: event.shiftKey ? Math.round(rotation / 15) * 15 : Math.round(normalizeDegrees(rotation)) })
    queueDraw()
  }
}
function pointerUp(): void {
  if (interaction?.kind === 'marquee') {
    const box = normalizeRect(interaction.start, interaction.current)
    if (box.width > 8 && box.height > 8) {
      const ids = resolveActiveClips(editor.project, editor.project.currentFrame).filter((clip) => clip.type !== 'audio' && rectsIntersect(clipAabb(clip.transform), box)).map((clip) => clip.id)
      editor.selectClips(ids)
    }
  }
  interaction = null; guides.value = []; marquee.value = null
}
function onDblclick(event: MouseEvent): void {
  const point = projectPoint(event as PointerEvent); if (!point) return
  const clip = hitTest(point.x, point.y)
  if (clip?.type === 'text' && clip.text && isClipInteractable(editor.project, clip.id)) {
    editor.selectClip(clip.id)
    editor.commit()
    textEdit.value = { id: clip.id, value: clip.text.content }
  }
}
function commitTextEdit(): void {
  if (!textEdit.value) return
  editor.updateText(textEdit.value.id, { content: textEdit.value.value })
  textEdit.value = null
}
function togglePlayback(): void { playback.toggle() }
function fitView(): void {
  const box = stage.value
  if (!box) return
  const next = fitCanvasZoom(
    box.clientWidth,
    box.clientHeight,
    editor.project.settings.width,
    editor.project.settings.height,
    props.expanded ? 48 : 80,
    props.expanded ? 1.5 : 0.72,
  )
  if (Math.abs(next - zoom.value) > 0.004) zoom.value = next
  autoFit.value = true
}
function nudgeZoom(delta: number): void {
  autoFit.value = false
  zoom.value = Math.min(1.5, Math.max(0.08, Number((zoom.value + delta).toFixed(2))))
}
function applyRatio(id: CanvasPresetId): void {
  editor.applyCanvasPreset(id)
  autoFit.value = true
  void nextTick(fitView)
}
function onRatioChange(event: Event): void {
  const id = (event.target as HTMLSelectElement).value
  if (id === 'custom') return
  applyRatio(id as CanvasPresetId)
}
function onKeydown(event: KeyboardEvent): void {
  const typing = isTypingTarget(event.target)
  if (event.code === 'Escape' && textEdit.value) {
    event.preventDefault()
    textEdit.value = null
    return
  }
  if (event.code === 'Escape' && props.expanded) {
    event.preventDefault()
    emit('toggleExpand')
    return
  }
  if (event.code !== 'Space' || typing) return
  event.preventDefault()
  togglePlayback()
}
function resetMedia(): void {
  media.forEach((source) => { if (source instanceof HTMLVideoElement) { source.pause(); source.removeAttribute('src'); source.load() } })
  media.clear(); audio.dispose()
}
watch(() => textEdit.value?.id, (id) => {
  if (!id) return
  void nextTick(() => document.querySelector<HTMLTextAreaElement>('.canvas-text-edit')?.focus())
})
watch(() => editor.project.id, () => { resetMedia(); void loadActiveMedia() })
watch(() => editor.project.materials.map((item) => `${item.id}:${item.objectUrl}:${item.missing}`).join('|'), () => { resetMedia(); void loadActiveMedia() })
watch(() => [editor.project.currentFrame, editor.project.updatedAt, editor.selectedClipIds.join('|')], () => { void loadActiveMedia(); void audio.sync(editor.project, editor.project.currentFrame, isPlaying.value) })
watch(() => [editor.project.settings.width, editor.project.settings.height], () => { if (autoFit.value) void nextTick(fitView) })
watch(() => props.expanded, () => { autoFit.value = true; void nextTick(fitView) })
onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  unbindPlayback = bindPreviewPlayback(togglePlayback, () => playback.pause())
  stageObserver = new ResizeObserver(() => { if (autoFit.value) fitView() })
  if (stage.value) stageObserver.observe(stage.value)
  await nextTick()
  fitView()
  await loadActiveMedia()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stageObserver?.disconnect()
  unbindPlayback()
  playback.dispose()
  resetMedia()
  cancelAnimationFrame(animation)
})
</script>

<template>
  <div class="preview-shell">
    <div class="preview-toolbar">
      <span>预览</span>
      <div>
        <small class="preview-size">{{ editor.project.settings.width }}×{{ editor.project.settings.height }}</small>
        <UiTooltip text="缩小画面">
          <button type="button" class="btn-icon" aria-label="缩小画面" @click="nudgeZoom(-0.1)"><UiIcon name="minus" /></button>
        </UiTooltip>
        <span class="preview-zoom">{{ Math.round(zoom * 100) }}%</span>
        <UiTooltip text="放大画面">
          <button type="button" class="btn-icon" aria-label="放大画面" @click="nudgeZoom(0.1)"><UiIcon name="plus" /></button>
        </UiTooltip>
        <UiTooltip text="适配窗口">
          <button type="button" class="btn-icon" aria-label="适配窗口" @click="fitView"><UiIcon name="fit" /></button>
        </UiTooltip>
      </div>
    </div>
    <!--主视图预览，主要是通过轨道的数据进行canvas渲染-->
    <div ref="stage" class="preview-stage">
      <div class="canvas-shell" :style="{ width: `${editor.project.settings.width * zoom}px`, height: `${editor.project.settings.height * zoom}px` }">
        <canvas ref="canvas" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp" @dblclick="onDblclick" />
        <TransformControls v-if="!textEdit && (groupTransform || activeSelectedTransform)" :transform="(groupTransform ?? activeSelectedTransform)!" :zoom="zoom" :canvas-width="editor.project.settings.width" :canvas-height="editor.project.settings.height" :rotate="!groupTransform" @handle-down="controlDown" />
        <textarea v-if="textEdit && textEditFrame" class="canvas-text-edit" :value="textEdit.value" :style="{ left: `${textEditFrame.x}px`, top: `${textEditFrame.y}px`, width: `${textEditFrame.width}px`, height: `${textEditFrame.height}px` }" @pointerdown.stop @input="textEdit.value = ($event.target as HTMLTextAreaElement).value" @blur="commitTextEdit" @keydown.enter.exact.prevent="commitTextEdit" />
        <span v-if="marquee" class="marquee" :style="{ left: `${marquee.left}px`, top: `${marquee.top}px`, width: `${marquee.width}px`, height: `${marquee.height}px` }" />
        <span v-for="guide in guides" :key="`${guide.orientation}-${guide.position}`" :class="['alignment-guide', guide.orientation]" :style="guide.orientation === 'vertical' ? { left: `${guide.position * zoom}px` } : { top: `${guide.position * zoom}px` }" />
      </div>
    </div>
    <div class="preview-controls">
      <div class="preview-transport">
        <UiTooltip text="上一帧">
          <button type="button" class="btn-icon" aria-label="上一帧" @click="editor.setCurrentFrame(Math.max(0, editor.project.currentFrame - 1))"><UiIcon name="prev" /></button>
        </UiTooltip>
        <UiTooltip text="播放 / 暂停" shortcut="空格">
          <button type="button" class="btn-icon preview-play" aria-label="播放 / 暂停" @click="togglePlayback"><UiIcon :name="isPlaying ? 'pause' : 'play'" /></button>
        </UiTooltip>
        <UiTooltip text="下一帧">
          <button type="button" class="btn-icon" aria-label="下一帧" @click="editor.setCurrentFrame(Math.min(editor.project.settings.durationFrames - 1, editor.project.currentFrame + 1))"><UiIcon name="next" /></button>
        </UiTooltip>
        <span class="transport-sep" />
        <div class="preview-edit-tools" role="group" aria-label="分割与裁剪">
          <UiTooltip text="向左裁剪：去掉播放头左边" shortcut="[">
            <button type="button" class="preview-split left" aria-label="向左裁剪" :disabled="!editor.canSplitAtPlayhead" @click.stop="editor.splitSelectedLeft()"><UiIcon name="trimLeft" :size="18" /></button>
          </UiTooltip>
          <UiTooltip text="分割：在播放头处一分为二" shortcut="Ctrl+B">
            <button type="button" class="preview-split cut" aria-label="分割" :disabled="!editor.canSplitAtPlayhead" @click.stop="editor.splitSelectedAtPlayhead()"><UiIcon name="splitClip" :size="18" /></button>
          </UiTooltip>
          <UiTooltip text="向右裁剪：去掉播放头右边" shortcut="]">
            <button type="button" class="preview-split right" aria-label="向右裁剪" :disabled="!editor.canSplitAtPlayhead" @click.stop="editor.splitSelectedRight()"><UiIcon name="trimRight" :size="18" /></button>
          </UiTooltip>
        </div>
        <span class="transport-sep" />
        <label class="preview-ratio">
          <span>比例</span>
          <select :value="activeRatio" :title="`${editor.project.settings.width}×${editor.project.settings.height}`" @change="onRatioChange">
            <option v-for="item in CANVAS_PRESETS" :key="item.id" :value="item.id">{{ item.label }}</option>
            <option v-if="activeRatio === 'custom'" value="custom">自定义</option>
          </select>
        </label>
        <UiTooltip :text="expanded ? '还原主视图' : '放大主视图'">
          <button type="button" class="btn-icon preview-expand" :aria-label="expanded ? '还原主视图' : '放大主视图'" @click="emit('toggleExpand')"><UiIcon :name="expanded ? 'restore' : 'expand'" /></button>
        </UiTooltip>
        <span class="preview-timecode">{{ frameToTimecode(editor.project.currentFrame, editor.project.settings.fps) }} · {{ editor.project.settings.fps }} FPS</span>
      </div>
    </div>
  </div>
</template>
