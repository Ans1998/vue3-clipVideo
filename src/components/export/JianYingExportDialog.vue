<script setup lang="ts">
import Modal from '@/components/layout/Modal.vue'
import { useExportStore } from '@/stores/export'
import { useEditorStore } from '@/stores/editor'

const exporter = useExportStore()
const editor = useEditorStore()
</script>

<template>
  <Modal title="导出剪映草稿" closable @close="exporter.close">
    <p class="hint">将生成 ZIP，内含 draft_content.json、draft_meta_info.json 与 Resources/ 素材副本。映射版本为剪映 13.0 兼容结构，打开后请核对轨道与文字。</p>
    <ul class="result-list">
      <li>项目：{{ editor.project.name }}</li>
      <li>素材：{{ editor.project.materials.length }} 个</li>
      <li>片段：{{ editor.project.clips.length }} 个</li>
    </ul>
    <p v-if="exporter.error" class="error-message">{{ exporter.error }}</p>
    <p v-if="editor.missingMaterials.length" class="error-message">有素材丢失，对应资源可能无法打进 ZIP。</p>
    <template #footer>
      <button type="button" @click="exporter.close">取消</button>
      <button type="button" class="primary-button" @click="exporter.startJianYing">开始导出</button>
    </template>
  </Modal>
</template>
