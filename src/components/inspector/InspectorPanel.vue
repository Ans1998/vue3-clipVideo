<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '@/stores/editor'
import type { ClipFilter, ClipTransitionKind, ProjectSettings, TextConfig, Transform } from '@/types/editor'
import { CLIP_SPEED_OPTIONS, CLIP_TRANSITION_IN, CLIP_TRANSITION_OUT } from '@/types/editor'
import { clipFilter, clipSpeed, resolvedTransition } from '@/utils/timeline/clipPlayback'
import type { AlignMode } from '@/utils/scene/align'
import { CANVAS_PRESETS, matchingCanvasPreset, type CanvasPresetId } from '@/utils/scene/canvas'
import { EXPORT_FPS_OPTIONS } from '@/types/export'
import { frameToTimecode } from '@/utils/timeline/timecode'
import { sourceLength } from '@/utils/timeline/timing'
import UiIcon from '@/components/layout/UiIcon.vue'
import UiTooltip from '@/components/layout/UiTooltip.vue'

defineProps<{ collapsed?: boolean }>()
const emit = defineEmits<{ toggleCollapse: [] }>()

const editor = useEditorStore()
const clip = computed(() => editor.selectedClip)
const multi = computed(() => editor.selectedClipIds.length > 1)
const sourceFrames = computed(() => clip.value ? sourceLength(editor.project, clip.value) : null)
const filter = computed(() => clip.value ? clipFilter(clip.value) : null)
const maxTimeline = computed(() => {
  if (!clip.value || sourceFrames.value == null) return null
  return Math.max(1, Math.floor((sourceFrames.value - clip.value.offsetFrame) / clipSpeed(clip.value)))
})
function beginEdit(): void { editor.commit() }
function transform(key: keyof Transform, event: Event): void {
  if (!clip.value) return
  editor.updateTransform(clip.value.id, { [key]: Number((event.target as HTMLInputElement).value) })
}
function text(key: keyof TextConfig, event: Event): void {
  if (!clip.value) return
  const input = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  const numeric = ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].includes(key)
  editor.updateText(clip.value.id, { [key]: numeric ? Number(input.value) : input.value } as Partial<TextConfig>)
}
function timing(key: 'startFrame' | 'durationFrames' | 'offsetFrame', event: Event): void {
  if (!clip.value) return
  editor.updateClipTiming(clip.value.id, { [key]: Number((event.target as HTMLInputElement).value) }, true)
}
function align(mode: AlignMode): void { editor.alignSelected(mode) }
function toggleTextStyle(key: 'italic' | 'underline' | 'strikethrough'): void {
  if (!clip.value?.text || clip.value.locked) return
  beginEdit()
  editor.updateText(clip.value.id, { [key]: !clip.value.text[key] })
}
function setting<K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]): void {
  editor.updateSettings({ [key]: value })
}
function applyRatio(id: CanvasPresetId): void {
  editor.applyCanvasPreset(id)
}
function updateFilter(key: keyof ClipFilter, event: Event): void {
  if (!clip.value) return
  editor.updateClipFilter(clip.value.id, { [key]: Number((event.target as HTMLInputElement).value) })
}
function updateTransition(side: 'in' | 'out', patch: { kind?: ClipTransitionKind; durationFrames?: number }): void {
  if (!clip.value) return
  editor.updateClipTransition(clip.value.id, side, patch)
}
const intro = computed(() => clip.value ? resolvedTransition(clip.value, 'in') : null)
const outro = computed(() => clip.value ? resolvedTransition(clip.value, 'out') : null)
const activeRatio = computed(() => matchingCanvasPreset(editor.project.settings.width, editor.project.settings.height))
</script>

<template>
  <div class="inspector-panel">
    <div class="panel-heading">
      <span v-if="!collapsed">属性</span>
      <div class="panel-heading-actions">
        <UiTooltip :text="collapsed ? '展开属性' : '收起属性'" placement="bottom">
          <button class="btn-icon" type="button" :aria-label="collapsed ? '展开属性' : '收起属性'" @click="emit('toggleCollapse')"><UiIcon :name="collapsed ? 'panelRightOpen' : 'panelRight'" /></button>
        </UiTooltip>
      </div>
    </div>
    <div v-show="!collapsed" class="inspector-content">
    <div v-if="multi">
      <section class="inspector-section"><h3>多选 · {{ editor.selectedClipIds.length }}</h3>
        <div class="align-grid">
          <button v-for="item in [{ id: 'left', label: '左齐' }, { id: 'center', label: '水平居中' }, { id: 'right', label: '右齐' }, { id: 'top', label: '顶齐' }, { id: 'middle', label: '垂直居中' }, { id: 'bottom', label: '底齐' }]" :key="item.id" type="button" @click="align(item.id as AlignMode)">{{ item.label }}</button>
        </div>
        <p class="hint">拖动预览框可整体缩放，Shift 保持等比。</p>
      </section>
    </div>
    <template v-else-if="clip">
      <section class="inspector-toolbar">
        <UiTooltip :text="clip.locked ? '解锁' : '锁定'" placement="bottom">
          <button type="button" class="btn-icon" :class="{ active: clip.locked }" :aria-label="clip.locked ? '解锁' : '锁定'" @click="editor.toggleLock(clip.id)"><UiIcon :name="clip.locked ? 'lock' : 'unlock'" /></button>
        </UiTooltip>
        <span>图层</span>
        <UiTooltip text="置顶" placement="bottom"><button type="button" class="btn-icon" :disabled="clip.locked" aria-label="置顶" @click="editor.moveSelectedLayer('front')"><UiIcon name="front" /></button></UiTooltip>
        <UiTooltip text="上移" placement="bottom"><button type="button" class="btn-icon" :disabled="clip.locked" aria-label="上移" @click="editor.moveSelectedLayer('forward')"><UiIcon name="forward" /></button></UiTooltip>
        <UiTooltip text="下移" placement="bottom"><button type="button" class="btn-icon" :disabled="clip.locked" aria-label="下移" @click="editor.moveSelectedLayer('backward')"><UiIcon name="backward" /></button></UiTooltip>
        <UiTooltip text="置底" placement="bottom"><button type="button" class="btn-icon" :disabled="clip.locked" aria-label="置底" @click="editor.moveSelectedLayer('back')"><UiIcon name="back" /></button></UiTooltip>
      </section>
      <section><label class="field-label">名称</label><input :value="clip.name" :disabled="clip.locked" @focus="beginEdit" @input="editor.updateClipName(clip.id, ($event.target as HTMLInputElement).value)" /></section>
      <details v-if="clip.type === 'text' && clip.text" class="inspector-fold" open>
        <summary>文字</summary>
        <label class="field-label">内容</label><textarea :value="clip.text.content" rows="3" :disabled="clip.locked" @focus="beginEdit" @input="text('content', $event)" />
        <label class="field-label">样式</label>
        <div class="text-style-row">
          <button type="button" :class="{ active: clip.text.italic }" :disabled="clip.locked" title="斜体" @click="toggleTextStyle('italic')"><i>I</i></button>
          <button type="button" :class="{ active: clip.text.underline }" :disabled="clip.locked" title="下划线" @click="toggleTextStyle('underline')"><span class="style-u">U</span></button>
          <button type="button" :class="{ active: clip.text.strikethrough }" :disabled="clip.locked" title="删除线" @click="toggleTextStyle('strikethrough')"><s>S</s></button>
        </div>
        <div class="fields-grid"><label><span>字体</span><select :value="clip.text.fontFamily" :disabled="clip.locked" @focus="beginEdit" @change="text('fontFamily', $event)"><option>Microsoft YaHei</option><option>Arial</option><option>Georgia</option><option>Impact</option></select></label><label><span>字号</span><input type="number" :disabled="clip.locked" :value="clip.text.fontSize" @focus="beginEdit" @input="text('fontSize', $event)" /></label><label><span>字重</span><select :value="clip.text.fontWeight" :disabled="clip.locked" @focus="beginEdit" @change="text('fontWeight', $event)"><option :value="400">常规</option><option :value="500">中等</option><option :value="700">粗体</option><option :value="900">特粗</option></select></label><label><span>对齐</span><select :value="clip.text.align" :disabled="clip.locked" @focus="beginEdit" @change="text('align', $event)"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label><label><span>颜色</span><input class="color-input" type="color" :disabled="clip.locked" :value="clip.text.color" @focus="beginEdit" @input="text('color', $event)" /></label><label><span>行高</span><input type="number" step="0.1" :disabled="clip.locked" :value="clip.text.lineHeight" @focus="beginEdit" @input="text('lineHeight', $event)" /></label><label><span>字间距</span><input type="number" step="1" :disabled="clip.locked" :value="clip.text.letterSpacing" @focus="beginEdit" @input="text('letterSpacing', $event)" /></label></div>
      </details>
      <details v-if="clip.type === 'audio' || clip.type === 'video'" class="inspector-fold">
        <summary>音频</summary>
        <div class="fields-grid"><label><span>音量</span><input type="number" min="0" max="1" step="0.05" :disabled="clip.locked" :value="clip.audio?.volume ?? 1" @change="editor.updateAudio(clip.id, { volume: Number(($event.target as HTMLInputElement).value) })" /></label><label><span>静音</span><select :disabled="clip.locked" :value="String(clip.audio?.muted ?? false)" @change="editor.updateAudio(clip.id, { muted: ($event.target as HTMLSelectElement).value === 'true' })"><option value="false">否</option><option value="true">是</option></select></label><label><span>淡入（帧）</span><input type="number" min="0" :disabled="clip.locked" :value="clip.audio?.fadeInFrames ?? 0" @change="editor.updateAudio(clip.id, { fadeInFrames: Number(($event.target as HTMLInputElement).value) })" /></label><label><span>淡出（帧）</span><input type="number" min="0" :disabled="clip.locked" :value="clip.audio?.fadeOutFrames ?? 0" @change="editor.updateAudio(clip.id, { fadeOutFrames: Number(($event.target as HTMLInputElement).value) })" /></label></div>
      </details>
      <details v-if="clip.type === 'video' || clip.type === 'audio'" class="inspector-fold">
        <summary>变速</summary>
        <div class="fields-grid"><label><span>速度</span><select :disabled="clip.locked" :value="clip.speed ?? 1" @change="editor.updateClipSpeed(clip.id, Number(($event.target as HTMLSelectElement).value))"><option v-for="item in CLIP_SPEED_OPTIONS" :key="item" :value="item">{{ item }}x</option></select></label></div>
        <p class="hint">大于 1 会缩短时间轴长度，小于 1 会拉长。入点和素材范围保持不变。</p>
      </details>
      <details v-if="clip.type !== 'audio' && intro && outro" class="inspector-fold" open>
        <summary>转场</summary>
        <div class="fields-grid"><label><span>入场</span><select :disabled="clip.locked" :value="intro.kind" @change="updateTransition('in', { kind: ($event.target as HTMLSelectElement).value as ClipTransitionKind })"><option v-for="item in CLIP_TRANSITION_IN" :key="item.id" :value="item.id">{{ item.label }}</option></select></label><label><span>入场时长（帧）</span><input type="number" min="1" :disabled="clip.locked || intro.kind === 'none'" :value="intro.durationFrames" @change="updateTransition('in', { durationFrames: Number(($event.target as HTMLInputElement).value) })" /></label><label><span>出场</span><select :disabled="clip.locked" :value="outro.kind" @change="updateTransition('out', { kind: ($event.target as HTMLSelectElement).value as ClipTransitionKind })"><option v-for="item in CLIP_TRANSITION_OUT" :key="item.id" :value="item.id">{{ item.label }}</option></select></label><label><span>出场时长（帧）</span><input type="number" min="1" :disabled="clip.locked || outro.kind === 'none'" :value="outro.durationFrames" @change="updateTransition('out', { durationFrames: Number(($event.target as HTMLInputElement).value) })" /></label></div>
        <p class="hint">入场从画面外滑入或淡入；出场在片段结尾反向离开。预览和导出视频都会生效。</p>
      </details>
      <details v-if="clip.type !== 'audio' && filter" class="inspector-fold">
        <summary>滤镜</summary>
        <div class="fields-grid"><label><span>亮度</span><input type="number" min="0" max="3" step="0.05" :disabled="clip.locked" :value="filter.brightness" @change="updateFilter('brightness', $event)" /></label><label><span>对比度</span><input type="number" min="0" max="3" step="0.05" :disabled="clip.locked" :value="filter.contrast" @change="updateFilter('contrast', $event)" /></label><label><span>饱和度</span><input type="number" min="0" max="3" step="0.05" :disabled="clip.locked" :value="filter.saturation" @change="updateFilter('saturation', $event)" /></label></div>
      </details>
      <details class="inspector-fold" open>
        <summary>变换</summary>
        <div class="fields-grid"><label v-for="item in [{ key: 'x', label: 'X' }, { key: 'y', label: 'Y' }, { key: 'width', label: 'W' }, { key: 'height', label: 'H' }, { key: 'scaleX', label: 'Scale X' }, { key: 'scaleY', label: 'Scale Y' }, { key: 'rotation', label: '旋转' }, { key: 'opacity', label: '不透明度' }]" :key="item.key"><span>{{ item.label }}</span><input type="number" :disabled="clip.locked" :step="item.key.includes('scale') || item.key === 'opacity' ? 0.05 : 1" :value="clip.transform[item.key as keyof Transform]" @focus="beginEdit" @input="transform(item.key as keyof Transform, $event)" /></label></div>
      </details>
      <details class="inspector-fold">
        <summary>时间</summary>
        <div class="fields-grid"><label><span>开始帧</span><input type="number" min="0" :disabled="clip.locked" :value="clip.startFrame" @change="timing('startFrame', $event)" /></label><label><span>持续帧</span><input type="number" min="1" :disabled="clip.locked" :value="clip.durationFrames" @change="timing('durationFrames', $event)" /></label><label v-if="sourceFrames != null"><span>入点</span><input type="number" min="0" :max="Math.max(0, sourceFrames - 1)" :disabled="clip.locked" :value="clip.offsetFrame" @change="timing('offsetFrame', $event)" /></label></div>
        <p v-if="sourceFrames != null" class="hint">素材 {{ sourceFrames }} 帧 · 当前速度 {{ clip.speed ?? 1 }}x · 入点后最多 {{ maxTimeline }} 帧</p>
      </details>
    </template>
    <div v-else>
      <section class="inspector-section"><h3>项目设置</h3>
        <div class="ratio-grid">
          <button v-for="item in CANVAS_PRESETS" :key="item.id" type="button" :class="{ active: activeRatio === item.id }" @click="applyRatio(item.id)">{{ item.label }}</button>
        </div>
        <div class="fields-grid">
          <label><span>宽</span><input type="number" min="16" :value="editor.project.settings.width" @change="setting('width', Number(($event.target as HTMLInputElement).value))" /></label>
          <label><span>高</span><input type="number" min="16" :value="editor.project.settings.height" @change="setting('height', Number(($event.target as HTMLInputElement).value))" /></label>
          <label><span>FPS</span><select :value="editor.project.settings.fps" @change="setting('fps', Number(($event.target as HTMLSelectElement).value) as ProjectSettings['fps'])"><option v-for="item in EXPORT_FPS_OPTIONS" :key="item" :value="item">{{ item }}</option></select></label>
          <label><span>时长（帧）</span><input type="number" min="1" :value="editor.project.settings.durationFrames" @change="setting('durationFrames', Number(($event.target as HTMLInputElement).value))" /></label>
        </div>
        <p class="hint">当前 {{ frameToTimecode(editor.project.settings.durationFrames, editor.project.settings.fps) }} · 内容到 {{ frameToTimecode(editor.contentFrames, editor.project.settings.fps) }}。时间轴会随片段自动延长。</p>
        <label class="field-label"><input type="checkbox" :checked="editor.project.settings.rippleEdit !== false" @change="editor.toggleRippleEdit()" /> 波纹编辑：删除后后面的片段自动前移</label>
      </section>
      <p class="inspector-empty">选择时间轴或画布中的素材以编辑属性；空画布拖动可框选。</p>
    </div>
    </div>
  </div>
</template>
