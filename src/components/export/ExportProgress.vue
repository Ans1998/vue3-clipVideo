<script setup lang="ts">
import Modal from '@/components/layout/Modal.vue'
import { useExportStore } from '@/stores/export'
import { useEditorStore } from '@/stores/editor'
import { frameToTimecode } from '@/utils/timeline/timecode'
import { formatClock } from '@/utils/format'

const editor = useEditorStore()
const exporter = useExportStore()
</script>

<template>
  <Modal :title="exporter.jianyingOpen ? '正在导出剪映草稿' : '正在导出视频'" :closable="false">
    <p class="export-status">{{ exporter.progress?.message || '正在准备导出...' }}</p>
    <div class="progress-track" role="progressbar" :aria-valuenow="exporter.progress?.percent ?? 0" aria-valuemin="0" aria-valuemax="100">
      <i :style="{ width: `${exporter.progress?.percent ?? 0}%` }" />
    </div>
    <p class="progress-label">{{ exporter.progress?.percent ?? 0 }}%</p>
    <p v-if="exporter.progress" class="hint">
      {{ frameToTimecode(exporter.progress.current, editor.project.settings.fps) }}
      /
      {{ frameToTimecode(exporter.progress.total, editor.project.settings.fps) }}
      · 已用 {{ formatClock(exporter.progress.elapsedMs) }}
      <template v-if="exporter.progress.remainingMs != null"> · 预计剩余 {{ formatClock(exporter.progress.remainingMs) }}</template>
    </p>
    <template #footer>
      <button type="button" class="danger-button" :disabled="exporter.progress?.status === 'cancelling'" @click="exporter.cancel">
        {{ exporter.progress?.status === 'cancelling' ? '正在取消...' : '取消导出' }}
      </button>
    </template>
  </Modal>
</template>
