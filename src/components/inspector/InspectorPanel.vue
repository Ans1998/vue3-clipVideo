<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '@/stores/editor'
import type { ProjectSettings, TextConfig, Transform } from '@/types/editor'
import type { AlignMode } from '@/utils/scene/align'
import { CANVAS_PRESETS, matchingCanvasPreset, type CanvasPresetId } from '@/utils/scene/canvas'
import { EXPORT_FPS_OPTIONS } from '@/types/export'
import { frameToTimecode } from '@/utils/timeline/timecode'
import { sourceLength } from '@/utils/timeline/timing'

const editor = useEditorStore()
const clip = computed(() => editor.selectedClip)
const multi = computed(() => editor.selectedClipIds.length > 1)
const sourceFrames = computed(() => clip.value ? sourceLength(editor.project, clip.value) : null)
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
function setting<K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]): void {
  editor.updateSettings({ [key]: value })
}
function applyRatio(id: CanvasPresetId): void {
  editor.applyCanvasPreset(id)
}
const activeRatio = computed(() => matchingCanvasPreset(editor.project.settings.width, editor.project.settings.height))
</script>

<template>
  <div class="inspector-panel">
    <div class="panel-heading"><span>属性检查器</span></div>
    <div v-if="multi" class="inspector-content">
      <section class="inspector-section"><h3>多选 · {{ editor.selectedClipIds.length }}</h3>
        <div class="align-grid">
          <button v-for="item in [{ id: 'left', label: '左齐' }, { id: 'center', label: '水平居中' }, { id: 'right', label: '右齐' }, { id: 'top', label: '顶齐' }, { id: 'middle', label: '垂直居中' }, { id: 'bottom', label: '底齐' }]" :key="item.id" type="button" @click="align(item.id as AlignMode)">{{ item.label }}</button>
        </div>
        <p class="hint">拖动预览框可整体缩放，Shift 保持等比。</p>
      </section>
    </div>
    <div v-else-if="clip" class="inspector-content">
      <section class="inspector-toolbar"><button type="button" :class="{ active: clip.locked }" @click="editor.toggleLock(clip.id)">{{ clip.locked ? '🔒 已锁定' : '🔓 锁定' }}</button><span>图层</span><button type="button" title="置顶" @click="editor.moveSelectedLayer('front')">⇈</button><button type="button" title="上移" @click="editor.moveSelectedLayer('forward')">↑</button><button type="button" title="下移" @click="editor.moveSelectedLayer('backward')">↓</button><button type="button" title="置底" @click="editor.moveSelectedLayer('back')">⇊</button></section>
      <section><label class="field-label">名称</label><input :value="clip.name" :disabled="clip.locked" @focus="beginEdit" @input="editor.updateClipName(clip.id, ($event.target as HTMLInputElement).value)" /></section>
      <section v-if="clip.type === 'text' && clip.text" class="text-controls"><h3>文字</h3><label class="field-label">内容</label><textarea :value="clip.text.content" rows="3" @focus="beginEdit" @input="text('content', $event)" /><div class="fields-grid"><label><span>字体</span><select :value="clip.text.fontFamily" @focus="beginEdit" @change="text('fontFamily', $event)"><option>Microsoft YaHei</option><option>Arial</option><option>Georgia</option><option>Impact</option></select></label><label><span>字号</span><input type="number" :value="clip.text.fontSize" @focus="beginEdit" @input="text('fontSize', $event)" /></label><label><span>字重</span><select :value="clip.text.fontWeight" @focus="beginEdit" @change="text('fontWeight', $event)"><option :value="400">常规</option><option :value="500">中等</option><option :value="700">粗体</option><option :value="900">特粗</option></select></label><label><span>对齐</span><select :value="clip.text.align" @focus="beginEdit" @change="text('align', $event)"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label><label><span>颜色</span><input class="color-input" type="color" :value="clip.text.color" @focus="beginEdit" @input="text('color', $event)" /></label><label><span>行高</span><input type="number" step="0.1" :value="clip.text.lineHeight" @focus="beginEdit" @input="text('lineHeight', $event)" /></label><label><span>字间距</span><input type="number" step="1" :value="clip.text.letterSpacing" @focus="beginEdit" @input="text('letterSpacing', $event)" /></label></div></section>
      <section v-if="clip.type === 'audio' || clip.type === 'video'" class="inspector-section"><h3>音频</h3><div class="fields-grid"><label><span>音量</span><input type="number" min="0" max="1" step="0.05" :value="clip.audio?.volume ?? 1" @change="editor.updateAudio(clip.id, { volume: Number(($event.target as HTMLInputElement).value) })" /></label><label><span>静音</span><select :value="String(clip.audio?.muted ?? false)" @change="editor.updateAudio(clip.id, { muted: ($event.target as HTMLSelectElement).value === 'true' })"><option value="false">否</option><option value="true">是</option></select></label></div></section>
      <section class="inspector-section"><h3>变换</h3><div class="fields-grid"><label v-for="item in [{ key: 'x', label: 'X' }, { key: 'y', label: 'Y' }, { key: 'width', label: 'W' }, { key: 'height', label: 'H' }, { key: 'scaleX', label: 'Scale X' }, { key: 'scaleY', label: 'Scale Y' }, { key: 'rotation', label: '旋转' }, { key: 'opacity', label: '不透明度' }]" :key="item.key"><span>{{ item.label }}</span><input type="number" :disabled="clip.locked" :step="item.key.includes('scale') || item.key === 'opacity' ? 0.05 : 1" :value="clip.transform[item.key as keyof Transform]" @focus="beginEdit" @input="transform(item.key as keyof Transform, $event)" /></label></div></section>
      <section class="inspector-section"><h3>时间</h3><div class="fields-grid"><label><span>开始帧</span><input type="number" min="0" :disabled="clip.locked" :value="clip.startFrame" @change="timing('startFrame', $event)" /></label><label><span>持续帧</span><input type="number" min="1" :disabled="clip.locked" :value="clip.durationFrames" @change="timing('durationFrames', $event)" /></label><label v-if="sourceFrames != null"><span>入点</span><input type="number" min="0" :max="Math.max(0, sourceFrames - 1)" :disabled="clip.locked" :value="clip.offsetFrame" @change="timing('offsetFrame', $event)" /></label></div><p v-if="sourceFrames != null" class="hint">素材 {{ sourceFrames }} 帧 · 入点后最多 {{ Math.max(1, sourceFrames - clip.offsetFrame) }} 帧</p></section>
    </div>
    <div v-else class="inspector-content">
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
      </section>
      <p class="inspector-empty">选择时间轴或画布中的素材以编辑属性；空画布拖动可框选。</p>
    </div>
  </div>
</template>
