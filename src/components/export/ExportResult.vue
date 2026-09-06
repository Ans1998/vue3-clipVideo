<script setup lang="ts">
import Modal from '@/components/layout/Modal.vue'
import { useExportStore } from '@/stores/export'
import { frameToTimecode } from '@/utils/timeline/timecode'
import { formatBytes } from '@/utils/format'

const exporter = useExportStore()
</script>

<template>
  <Modal v-if="exporter.result" title="导出完成" closable @close="exporter.close">
    <p class="export-complete">✓ 导出完成</p>
    <ul class="result-list">
      <li>文件：{{ exporter.result.fileName }}</li>
      <li>时长：{{ frameToTimecode(exporter.result.durationFrames, exporter.result.fps) }}</li>
      <li>分辨率：{{ exporter.result.width }} × {{ exporter.result.height }}</li>
      <li>FPS：{{ exporter.result.fps }}</li>
      <li>格式：{{ exporter.result.exporterId === 'jianying' ? 'ZIP 草稿' : exporter.result.format.toUpperCase() }}</li>
      <li>文件大小：{{ formatBytes(exporter.result.blob.size) }}</li>
    </ul>
    <p v-for="warning in exporter.result.warnings" :key="warning" class="hint">{{ warning }}</p>
    <template #footer>
      <button type="button" @click="exporter.retry">重新导出</button>
      <button type="button" class="primary-button" @click="exporter.download">下载文件</button>
    </template>
  </Modal>
</template>
