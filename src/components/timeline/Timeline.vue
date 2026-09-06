<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import ContextMenu, { type MenuItem } from '@/components/layout/ContextMenu.vue'
import { useEditorStore } from '@/stores/editor'
import { useNotifyStore } from '@/stores/notify'
import { pausePreviewPlayback } from '@/services/playback/registry'
import { frameToPixel, pixelToFrame } from '@/utils/timeline/coordinate'
import { frameToTimecode } from '@/utils/timeline/timecode'
import { canDetachAudio, canRemoveTrack, findTrack, isClipInteractable, RULER_ROW, resolveTrackDrop, toTrackType, TRACK_ROW, TYPE_LABEL, TYPE_SHORT, visibleClips, type TrackDropHint } from '@/utils/timeline/tracks'
import { fitPixelsPerFrame, limitedMoveDelta, trimLeftTo, trimRightTo, zoomPixelsPerFrame } from '@/utils/timeline/timing'
import type { ClipType, TimelineClip, TimelineTrack, TrackType } from '@/types/editor'

type Interaction =
  | { kind: 'playhead' }
  | { kind: 'move'; startX: number; startY: number; startScroll: number; type: ClipType; armed: boolean; clips: Array<{ id: string; startFrame: number; trackId: string }> }
  | { kind: 'trim'; edge: 'left' | 'right'; id: string; startX: number; startScroll: number; startFrame: number; durationFrames: number; offsetFrame: number }

const editor = useEditorStore()
const notify = useNotifyStore()
const scroll = ref<HTMLElement>()
const labels = ref<HTMLElement>()
const snapGuideFrame = ref<number | null>(null)
const dropHint = ref<TrackDropHint | null>(null)
const viewStart = ref(0)
const viewEnd = ref(editor.project.settings.durationFrames)
const interaction = ref<Interaction | null>(null)
const menu = ref<{ x: number; y: number; frame: number; trackId?: string; clipId?: string } | null>(null)
const menuItems = computed<MenuItem[]>(() => {
  const clip = menu.value?.clipId ? editor.project.clips.find((item) => item.id === menu.value?.clipId) : undefined
  const track = menu.value?.trackId ? findTrack(editor.project, menu.value.trackId) : undefined
  const hasSelection = editor.selectedClipIds.length > 0
  const clipItems: MenuItem[] = clip?.type === 'video' ? [
    { id: 'detach-audio', label: '分离音频', disabled: !canDetachAudio(editor.project, clip) },
    { id: 'sep-clip', label: '', separator: true },
  ] : []
  const trackItems: MenuItem[] = clip ? [] : [
    { id: 'add-visual', label: '新建画面轨' },
    { id: 'add-text', label: '新建文字轨' },
    { id: 'add-audio', label: '新建音频轨' },
    { id: 'sep-track', label: '', separator: true },
    { id: 'toggle-hidden', label: track?.hidden ? '显示轨道' : '隐藏轨道', disabled: !track },
    { id: 'toggle-muted', label: track?.muted ? '取消静音' : '静音轨道', disabled: !track },
    { id: 'toggle-lock', label: track?.locked ? '解锁轨道' : '锁定轨道', disabled: !track },
    { id: 'delete-track', label: '删除空轨道', disabled: !track || !canRemoveTrack(editor.project, track.id), danger: true },
    { id: 'sep-edit', label: '', separator: true },
  ]
  return [
    ...clipItems,
    ...trackItems,
    { id: 'copy', label: '复制', shortcut: 'Ctrl+C', disabled: !hasSelection },
    { id: 'cut', label: '剪切', shortcut: 'Ctrl+X', disabled: !hasSelection },
    { id: 'paste', label: '粘贴', shortcut: 'Ctrl+V', disabled: !editor.hasClipboard },
    { id: 'duplicate', label: '创建副本', shortcut: 'Ctrl+D', disabled: !hasSelection },
    { id: 'sep-select', label: '', separator: true },
    { id: 'select-all', label: '全选', shortcut: 'Ctrl+A' },
    { id: 'delete', label: '删除', shortcut: 'Delete', disabled: !hasSelection, danger: true },
  ]
})
const rulerMarks = computed(() => { const fps = editor.project.settings.fps; const step = editor.pixelsPerFrame < 2 ? fps * 5 : editor.pixelsPerFrame < 5 ? fps * 2 : fps; return Array.from({ length: Math.ceil(editor.project.settings.durationFrames / step) }, (_, index) => index * step) })
const timelineWidth = computed(() => frameToPixel(editor.project.settings.durationFrames, editor.pixelsPerFrame))
const dragType = computed<ClipType | null>(() => interaction.value?.kind === 'move' ? interaction.value.type : editor.project.materials.find((item) => item.id === editor.dragMaterialId)?.type ?? null)
const dropCaption = computed(() => dragType.value ? `松开以新建${TYPE_LABEL[toTrackType(dragType.value)]}` : '拖入素材或上下拖动片段到此处可新建轨道')
const insertTop = computed(() => dropHint.value?.kind === 'insert' ? `${RULER_ROW + dropHint.value.index * TRACK_ROW - 1}px` : '')
const ghost = computed(() => {
  const operation = interaction.value
  if (!operation || operation.kind !== 'move' || !operation.armed || !dropHint.value || dropHint.value.kind === 'blocked') return null
  const clip = editor.project.clips.find((item) => item.id === operation.clips[0].id)
  if (!clip) return null
  const hint = dropHint.value
  const row = hint.kind === 'onto' ? editor.orderedTracks.findIndex((track) => track.id === hint.trackId) : hint.kind === 'insert' ? hint.index : editor.orderedTracks.length
  if (row < 0) return null
  return { type: clip.type, left: left(clip), width: width(clip), top: `${RULER_ROW + row * TRACK_ROW + 5}px` }
})
const draggingPlayhead = computed(() => interaction.value?.kind === 'playhead')
function left(clip: TimelineClip): string { return `${frameToPixel(clip.startFrame, editor.pixelsPerFrame)}px` }
function width(clip: TimelineClip): string { return `${Math.max(24, frameToPixel(clip.durationFrames, editor.pixelsPerFrame))}px` }
function localFrame(event: MouseEvent): number { const box = scroll.value?.getBoundingClientRect(); return box ? pixelToFrame(event.clientX - box.left + scroll.value!.scrollLeft, editor.pixelsPerFrame) : 0 }
function canvasY(event: MouseEvent): number { const box = scroll.value?.getBoundingClientRect(); return box ? event.clientY - box.top + scroll.value!.scrollTop : 0 }
function startPlayhead(event: PointerEvent): void {
  if (event.button !== 0) return
  event.stopPropagation()
  pausePreviewPlayback()
  interaction.value = { kind: 'playhead' }
  editor.setCurrentFrame(localFrame(event))
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function updateViewport(): void {
  const element = scroll.value; if (!element) return
  viewStart.value = pixelToFrame(element.scrollLeft - 120, editor.pixelsPerFrame)
  viewEnd.value = pixelToFrame(element.scrollLeft + element.clientWidth + 120, editor.pixelsPerFrame)
  if (labels.value) labels.value.scrollTop = element.scrollTop
}
function clipsFor(trackId: string): TimelineClip[] { return visibleClips(editor.project, trackId, viewStart.value, viewEnd.value) }
function removable(track: TimelineTrack): boolean { return canRemoveTrack(editor.project, track.id) }
function snap(frame: number, ignored: string[] = []): number {
  const threshold = Math.max(2, Math.round(8 / editor.pixelsPerFrame))
  const candidates = [0, editor.project.currentFrame, editor.project.settings.durationFrames]
  editor.project.clips.filter((clip) => !ignored.includes(clip.id)).forEach((clip) => candidates.push(clip.startFrame, clip.startFrame + clip.durationFrames))
  let closest: number | undefined
  candidates.forEach((candidate) => { if (Math.abs(candidate - frame) <= threshold && (closest === undefined || Math.abs(candidate - frame) < Math.abs(closest - frame))) closest = candidate })
  snapGuideFrame.value = closest ?? null
  return closest ?? frame
}
function scrollForPointer(event: PointerEvent): void { const element = scroll.value; if (!element) return; const box = element.getBoundingClientRect(); const edge = 56; if (event.clientX < box.left + edge) element.scrollLeft -= Math.ceil((box.left + edge - event.clientX) / 6); if (event.clientX > box.right - edge) element.scrollLeft += Math.ceil((event.clientX - (box.right - edge)) / 6); if (event.clientY < box.top + edge) element.scrollTop -= Math.ceil((box.top + edge - event.clientY) / 6); if (event.clientY > box.bottom - edge) element.scrollTop += Math.ceil((event.clientY - (box.bottom - edge)) / 6) }
function startMove(event: PointerEvent, clip: TimelineClip): void {
  if (event.button !== 0) return
  if (!isClipInteractable(editor.project, clip.id)) { notify.push('warn', '片段或轨道已锁定'); return }
  event.stopPropagation()
  if (event.ctrlKey || event.shiftKey) editor.selectClip(clip.id, true)
  else if (!editor.selectedClipIds.includes(clip.id)) editor.selectClip(clip.id)
  editor.commit()
  const selected = editor.selectedClipIds.includes(clip.id) ? editor.project.clips.filter((item) => editor.selectedClipIds.includes(item.id) && item.type === clip.type && isClipInteractable(editor.project, item.id)) : [clip]
  interaction.value = { kind: 'move', startX: event.clientX, startY: event.clientY, startScroll: scroll.value?.scrollLeft ?? 0, type: clip.type, armed: false, clips: selected.map((item) => ({ id: item.id, startFrame: item.startFrame, trackId: item.trackId })) }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function startTrim(event: PointerEvent, clip: TimelineClip, edge: 'left' | 'right'): void {
  if (!isClipInteractable(editor.project, clip.id)) return
  event.preventDefault(); event.stopPropagation(); editor.selectClip(clip.id); editor.commit()
  interaction.value = { kind: 'trim', edge, id: clip.id, startX: event.clientX, startScroll: scroll.value?.scrollLeft ?? 0, startFrame: clip.startFrame, durationFrames: clip.durationFrames, offsetFrame: clip.offsetFrame }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function move(event: PointerEvent): void {
  const operation = interaction.value; if (!operation) return
  scrollForPointer(event)
  if (operation.kind === 'playhead') {
    editor.setCurrentFrame(localFrame(event))
    return
  }
  const scrollOffset = (scroll.value?.scrollLeft ?? 0) - operation.startScroll
  const delta = Math.round((event.clientX - operation.startX + scrollOffset) / editor.pixelsPerFrame)
  if (operation.kind === 'move') {
    const anchor = operation.clips[0];     const snapped = snap(Math.max(0, anchor.startFrame + delta), operation.clips.map((clip) => clip.id))
    const moving = operation.clips.flatMap((clip) => {
      const item = editor.project.clips.find((entry) => entry.id === clip.id)
      return item ? [{ id: clip.id, trackId: item.trackId, startFrame: clip.startFrame, durationFrames: item.durationFrames }] : []
    })
    const corrected = limitedMoveDelta(editor.project, moving, snapped - anchor.startFrame)
    operation.clips.forEach((clip) => editor.updateClipTiming(clip.id, { startFrame: Math.max(0, clip.startFrame + corrected) }))
    operation.armed = Math.abs(event.clientY - operation.startY) >= 12
    dropHint.value = operation.armed ? resolveTrackDrop(canvasY(event), editor.orderedTracks, operation.type) : null
  } else {
    const clip = editor.project.clips.find((item) => item.id === operation.id); if (!clip) return
    if (operation.edge === 'left') {
      const requested = snap(Math.max(0, operation.startFrame + delta), [clip.id])
      const original = { ...clip, startFrame: operation.startFrame, durationFrames: operation.durationFrames, offsetFrame: operation.offsetFrame }
      editor.updateClipTiming(clip.id, trimLeftTo(editor.project, original, requested))
    } else {
      const requested = snap(Math.max(operation.startFrame + 1, operation.startFrame + operation.durationFrames + delta), [clip.id])
      const original = { ...clip, startFrame: operation.startFrame, durationFrames: operation.durationFrames, offsetFrame: operation.offsetFrame }
      editor.updateClipTiming(clip.id, trimRightTo(editor.project, original, requested))
    }
  }
}
function endInteraction(): void {
  const operation = interaction.value
  const hint = dropHint.value
  interaction.value = null
  dropHint.value = null
  snapGuideFrame.value = null
  if (operation?.kind === 'move' && operation.armed && hint) editor.applyTrackDrop(operation.clips.map((clip) => clip.id), operation.type, hint)
}
function materialFromDrag(): ReturnType<typeof editor.project.materials.find> {
  return editor.project.materials.find((item) => item.id === editor.dragMaterialId)
}
function onDragOver(event: DragEvent): void {
  const material = materialFromDrag(); if (!material) return
  event.preventDefault()
  dropHint.value = resolveTrackDrop(canvasY(event), editor.orderedTracks, material.type)
}
function onDragLeave(event: DragEvent): void {
  const next = event.relatedTarget as Node | null
  if (next && scroll.value?.contains(next)) return
  if (!interaction.value) dropHint.value = null
}
function dropMaterial(event: DragEvent): void {
  const material = materialFromDrag(); dropHint.value = null; editor.dragMaterialId = ''
  if (!material) return
  event.preventDefault()
  const hint = resolveTrackDrop(canvasY(event), editor.orderedTracks, material.type)
  const frame = localFrame(event)
  if (hint.kind === 'blocked') { notify.push('warn', '轨道已锁定'); return }
  if (hint.kind === 'new') editor.addClip(material, frame, 'new', true)
  else if (hint.kind === 'insert') editor.addClip(material, frame, 'new', true, hint.afterOrder)
  else editor.addClip(material, frame, hint.trackId)
}
function openClipMenu(event: MouseEvent, clip: TimelineClip): void {
  event.preventDefault()
  event.stopPropagation()
  if (!editor.selectedClipIds.includes(clip.id)) editor.selectClip(clip.id)
  menu.value = { x: event.clientX, y: event.clientY, frame: clip.startFrame, trackId: clip.trackId, clipId: clip.id }
}
function openTrackMenu(event: MouseEvent, track?: TimelineTrack): void {
  event.preventDefault()
  event.stopPropagation()
  const frame = localFrame(event)
  editor.setCurrentFrame(frame)
  menu.value = { x: event.clientX, y: event.clientY, frame, trackId: track?.id }
}
function openLabelMenu(event: MouseEvent, track: TimelineTrack): void {
  event.preventDefault()
  event.stopPropagation()
  menu.value = { x: event.clientX, y: event.clientY, frame: editor.project.currentFrame, trackId: track.id }
}
function onMenuSelect(id: string): void {
  const target = menu.value
  const track = target?.trackId ? findTrack(editor.project, target.trackId) : undefined
  menu.value = null
  if (id === 'copy') editor.copySelected()
  else if (id === 'cut') editor.cutSelected()
  else if (id === 'paste') editor.pasteAtFrame(target?.frame ?? editor.project.currentFrame, target?.trackId)
  else if (id === 'duplicate') editor.duplicateSelected()
  else if (id === 'select-all') editor.selectAllClips()
  else if (id === 'delete') editor.removeSelected()
  else if (id === 'detach-audio') editor.splitClipAudio(target?.clipId)
  else if (id === 'add-visual' || id === 'add-text' || id === 'add-audio') editor.addTrack(id.replace('add-', '') as TrackType, track?.order)
  else if (id === 'toggle-hidden' && target?.trackId) editor.toggleTrackHidden(target.trackId)
  else if (id === 'toggle-muted' && target?.trackId) editor.toggleTrackMuted(target.trackId)
  else if (id === 'toggle-lock' && target?.trackId) editor.toggleTrackLock(target.trackId)
  else if (id === 'delete-track' && target?.trackId) editor.removeTrack(target.trackId)
}
function followPlayhead(): void {
  const element = scroll.value
  if (!element || interaction.value) return
  const x = frameToPixel(editor.project.currentFrame, editor.pixelsPerFrame)
  const margin = 56
  if (x < element.scrollLeft + margin) element.scrollLeft = Math.max(0, x - margin)
  else if (x > element.scrollLeft + element.clientWidth - margin) element.scrollLeft = x - element.clientWidth + margin
}
function fitTimeline(): void {
  const width = scroll.value?.clientWidth ?? 800
  editor.pixelsPerFrame = fitPixelsPerFrame(width, editor.project.settings.durationFrames)
}
watch(() => editor.project.currentFrame, followPlayhead)
onMounted(() => { scroll.value?.addEventListener('scroll', updateViewport, { passive: true }); updateViewport() })
onUnmounted(() => scroll.value?.removeEventListener('scroll', updateViewport))
</script>

<template>
  <div class="timeline-header">
    <span>时间轴</span>
    <small class="timeline-hint">拖边缘可拉长/裁短 · 适配窗口可看完整时长</small>
    <div>
      <button type="button" title="缩小" @click="editor.pixelsPerFrame = zoomPixelsPerFrame(editor.pixelsPerFrame, -1)">−</button>
      <button type="button" title="放大" @click="editor.pixelsPerFrame = zoomPixelsPerFrame(editor.pixelsPerFrame, 1)">＋</button>
      <button type="button" title="适配时间轴" @click="fitTimeline">适配</button>
      <span>{{ frameToTimecode(editor.project.currentFrame, editor.project.settings.fps) }}</span>
    </div>
  </div>
  <div class="timeline-body">
    <div ref="labels" class="track-labels">
      <div class="ruler-spacer" />
      <div v-for="track in editor.orderedTracks" :key="track.id" class="track-label" :class="{ locked: track.locked, hidden: track.hidden, muted: track.muted, 'drop-onto': dropHint?.kind === 'onto' && dropHint.trackId === track.id }" @contextmenu="openLabelMenu($event, track)">
        <i :class="['track-kind', track.type]">{{ TYPE_SHORT[track.type] }}</i>
        <span>{{ track.name }}</span>
        <button type="button" class="track-action" :class="{ active: !track.hidden }" :title="track.hidden ? '显示轨道' : '隐藏轨道'" @click="editor.toggleTrackHidden(track.id)">{{ track.hidden ? '🙈' : '👁' }}</button>
        <button type="button" class="track-action" :class="{ active: !track.muted }" :title="track.muted ? '取消静音' : '静音轨道'" @click="editor.toggleTrackMuted(track.id)">{{ track.muted ? '🔇' : '🔊' }}</button>
        <button type="button" class="track-action" :title="track.locked ? '解锁轨道' : '锁定轨道'" @click="editor.toggleTrackLock(track.id)">{{ track.locked ? '🔒' : '🔓' }}</button>
        <button type="button" class="track-action" title="在下方新建同类型轨道" @click="editor.addTrack(track.type, track.order)">＋</button>
        <button v-if="removable(track)" type="button" class="track-action track-remove" title="删除空轨道" @click="editor.removeTrack(track.id)">×</button>
      </div>
      <div class="track-label new-track-label" :class="{ active: dropHint?.kind === 'new' }">
        <span>新建轨道</span>
        <button type="button" class="track-add-type" title="新建画面轨" @click="editor.addTrack('visual')">画</button>
        <button type="button" class="track-add-type" title="新建文字轨" @click="editor.addTrack('text')">文</button>
        <button type="button" class="track-add-type" title="新建音频轨" @click="editor.addTrack('audio')">音</button>
      </div>
    </div>
    <div ref="scroll" class="timeline-scroll" @dragover="onDragOver" @dragleave="onDragLeave" @drop.prevent="dropMaterial" @contextmenu.prevent="openTrackMenu($event)">
      <div class="timeline-canvas" :style="{ width: `${timelineWidth}px` }">
        <div class="timeline-ruler" @pointerdown="startPlayhead" @pointermove="move" @pointerup="endInteraction" @pointercancel="endInteraction"><span v-for="frame in rulerMarks" :key="frame" :style="{ left: `${frameToPixel(frame, editor.pixelsPerFrame)}px` }">{{ frameToTimecode(frame, editor.project.settings.fps) }}</span></div>
        <div v-for="track in editor.orderedTracks" :key="track.id" class="timeline-track" :class="{ locked: track.locked, hidden: track.hidden, muted: track.muted, 'drop-onto': dropHint?.kind === 'onto' && dropHint.trackId === track.id }" @pointerdown="startPlayhead" @pointermove="move" @pointerup="endInteraction" @contextmenu="openTrackMenu($event, track)">
          <button v-for="clip in clipsFor(track.id)" :key="clip.id" :class="['timeline-clip', clip.type, { selected: editor.selectedClipIds.includes(clip.id) }]" :style="{ left: left(clip), width: width(clip) }" @pointerdown="startMove($event, clip)" @pointermove="move" @pointerup="endInteraction" @pointercancel="endInteraction" @contextmenu="openClipMenu($event, clip)"><span class="trim-handle left" @pointerdown="startTrim($event, clip, 'left')" /><span class="clip-title">{{ clip.name }}</span><span class="trim-handle right" @pointerdown="startTrim($event, clip, 'right')" /></button>
        </div>
        <div class="timeline-track new-track-drop" :class="{ active: dropHint?.kind === 'new' }">{{ editor.project.clips.length ? dropCaption : '将素材拖入时间轴开始编辑' }}</div>
        <div v-if="ghost" class="timeline-clip ghost" :class="ghost.type" :style="{ left: ghost.left, width: ghost.width, top: ghost.top }" />
        <div v-if="dropHint?.kind === 'insert'" class="track-insert-line" :style="{ top: insertTop }" />
        <div class="playhead" :class="{ dragging: draggingPlayhead }" :style="{ left: `${frameToPixel(editor.project.currentFrame, editor.pixelsPerFrame)}px` }" @pointerdown="startPlayhead" @pointermove="move" @pointerup="endInteraction" @pointercancel="endInteraction">
          <i />
          <b v-if="draggingPlayhead" class="playhead-time">{{ frameToTimecode(editor.project.currentFrame, editor.project.settings.fps) }}</b>
        </div>
        <div v-if="snapGuideFrame !== null" class="timeline-snap-guide" :style="{ left: `${frameToPixel(snapGuideFrame, editor.pixelsPerFrame)}px` }" />
      </div>
    </div>
  </div>
  <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menuItems" @close="menu = null" @select="onMenuSelect" />
</template>
