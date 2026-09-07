<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import Modal from '@/components/layout/Modal.vue'
import { useEditorStore } from '@/stores/editor'
import { useExportStore } from '@/stores/export'
import { frameToTimecode, timecodeToFrame } from '@/utils/timeline/timecode'
import { evenSize } from '@/services/export/codecs'
import { exportContentRange, occupiedExportFrames } from '@/utils/timeline/exportRange'
import { EXPORT_FPS_OPTIONS, QUALITY_LABELS, RESOLUTION_PRESETS, type ExportFormat, type ExportQuality, type ExportRangeMode, type ExportResolutionPreset } from '@/types/export'
import type { ProjectSettings } from '@/types/editor'

const editor = useEditorStore()
const exporter = useExportStore()
const form = reactive({
  fileName: exporter.defaultFileName(),
  format: (exporter.capabilities.mp4 ? 'mp4' : 'webm') as ExportFormat,
  preset: 'project' as ExportResolutionPreset,
  width: editor.project.settings.width,
  height: editor.project.settings.height,
  fps: editor.project.settings.fps as ProjectSettings['fps'],
  quality: 'high' as ExportQuality,
  rangeMode: 'all' as ExportRangeMode,
  startCode: frameToTimecode(0, editor.project.settings.fps),
  endCode: frameToTimecode(editor.project.settings.durationFrames, editor.project.settings.fps),
})

watch(() => exporter.dialogOpen, (open) => {
  if (!open) return
  form.fileName = exporter.defaultFileName()
  form.format = exporter.capabilities.mp4 ? 'mp4' : 'webm'
  form.preset = 'project'
  form.width = editor.project.settings.width
  form.height = editor.project.settings.height
  form.fps = editor.project.settings.fps
  form.quality = 'high'
  form.rangeMode = 'all'
  const content = exportContentRange(editor.project)
  form.startCode = frameToTimecode(content?.startFrame ?? 0, editor.project.settings.fps)
  form.endCode = frameToTimecode(content?.endFrame ?? editor.project.settings.durationFrames, editor.project.settings.fps)
})

const rangeError = computed(() => {
  const start = timecodeToFrame(form.startCode, editor.project.settings.fps)
  const end = timecodeToFrame(form.endCode, editor.project.settings.fps)
  if (start == null || end == null) return '时间码格式为 HH:MM:SS:FF'
  if (end <= start) return '结束时间必须大于开始时间'
  return ''
})

function applyPreset(preset: ExportResolutionPreset): void {
  form.preset = preset
  if (preset === 'project') { form.width = editor.project.settings.width; form.height = editor.project.settings.height; return }
  const item = RESOLUTION_PRESETS.find((entry) => entry.id === preset)
  if (item?.width && item.height) { form.width = item.width; form.height = item.height }
}

function clipRange(): { startFrame: number; endFrame: number } | null {
  const selected = editor.project.clips.filter((clip) => editor.selectedClipIds.includes(clip.id))
  if (!selected.length) return exportContentRange(editor.project)
  return {
    startFrame: Math.min(...selected.map((clip) => clip.startFrame)),
    endFrame: Math.max(...selected.map((clip) => clip.startFrame + clip.durationFrames)),
  }
}

function resolvedRange(): { startFrame: number; endFrame: number } | null {
  if (form.rangeMode === 'all') return exportContentRange(editor.project)
  if (form.rangeMode === 'clip') return clipRange()
  const startFrame = timecodeToFrame(form.startCode, editor.project.settings.fps) ?? 0
  const endFrame = timecodeToFrame(form.endCode, editor.project.settings.fps) ?? editor.project.settings.durationFrames
  return { startFrame, endFrame: Math.max(startFrame + 1, endFrame) }
}

const occupiedFrames = computed(() => {
  const range = resolvedRange()
  if (!range) return []
  return occupiedExportFrames(editor.project, range.startFrame, range.endFrame)
})

const rangeSummary = computed(() => {
  const frames = occupiedFrames.value.length
  return `${frames} 帧 · ${frameToTimecode(frames, form.fps)} · ${form.width}×${form.height} @ ${form.fps} FPS`
})

function submit(): void {
  if (form.rangeMode === 'custom' && rangeError.value) return
  const range = resolvedRange()
  if (!range || !occupiedFrames.value.length) return
  void exporter.start({
    fileName: form.fileName,
    format: form.format,
    width: evenSize(Math.max(16, Math.round(form.width))),
    height: evenSize(Math.max(16, Math.round(form.height))),
    fps: form.fps,
    quality: form.quality,
    startFrame: range.startFrame,
    endFrame: range.endFrame,
  })
}
</script>

<template>
  <Modal title="导出视频" closable @close="exporter.close">
    <p v-if="exporter.error" class="error-message">{{ exporter.error }}</p>
    <div class="export-grid">
      <label>文件名称<input v-model="form.fileName" /></label>
      <label>格式
        <select v-model="form.format">
          <option value="mp4" :disabled="!exporter.capabilities.mp4 && !exporter.capabilities.webm">MP4</option>
          <option value="webm" :disabled="!exporter.capabilities.webm">WebM</option>
        </select>
      </label>
      <label>分辨率
        <select :value="form.preset" @change="applyPreset(($event.target as HTMLSelectElement).value as ExportResolutionPreset)">
          <option v-for="item in RESOLUTION_PRESETS" :key="item.id" :value="item.id">{{ item.label }}</option>
        </select>
      </label>
      <div class="fields-grid">
        <label>宽<input v-model.number="form.width" type="number" min="16" :disabled="form.preset !== 'custom'" /></label>
        <label>高<input v-model.number="form.height" type="number" min="16" :disabled="form.preset !== 'custom'" /></label>
      </div>
      <label>FPS
        <select v-model.number="form.fps">
          <option v-for="item in EXPORT_FPS_OPTIONS" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <label>质量
        <select v-model="form.quality">
          <option v-for="(label, value) in QUALITY_LABELS" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label>导出范围
        <select v-model="form.rangeMode">
          <option value="all">轨道内容</option>
          <option value="clip" :disabled="!editor.selectedClipIds.length">当前片段</option>
          <option value="custom">自定义范围</option>
        </select>
      </label>
      <div v-if="form.rangeMode === 'custom'" class="fields-grid">
        <label>开始<input v-model="form.startCode" /></label>
        <label>结束<input v-model="form.endCode" /></label>
      </div>
    </div>
    <p v-if="form.rangeMode === 'custom' && rangeError" class="error-message">{{ rangeError }}</p>
    <p v-else-if="!occupiedFrames.length" class="error-message">时间轴上没有可导出的内容</p>
    <p class="hint">预计导出：{{ rangeSummary }}。只导出轨道上有片段的部分，片头、片尾和片段之间的空白不会写入文件。导出为只读操作，不会改动时间轴。MP4 若浏览器无法稳定编码，将自动降级为 WebM。</p>
    <p v-if="!exporter.capabilities.webCodecs" class="hint">当前环境未检测到 WebCodecs VideoEncoder，将走 MediaRecorder 任务框架。</p>
    <template #footer>
      <button type="button" @click="exporter.close">取消</button>
      <button type="button" class="primary-button" :disabled="Boolean((form.rangeMode === 'custom' && rangeError) || !occupiedFrames.length)" @click="submit">开始导出</button>
    </template>
  </Modal>
</template>
