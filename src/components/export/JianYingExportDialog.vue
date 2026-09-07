<script setup lang="ts">
import { computed } from 'vue'
import Modal from '@/components/layout/Modal.vue'
import { useExportStore } from '@/stores/export'
import { useEditorStore } from '@/stores/editor'

const exporter = useExportStore()
const editor = useEditorStore()
const usedMissing = computed(() => {
  const used = new Set(editor.project.clips.map((clip) => clip.materialId).filter((id): id is string => Boolean(id)))
  return editor.project.materials.filter((material) => material.missing && used.has(material.id))
})
const blocked = computed(() => Boolean(usedMissing.value.length))
</script>

<template>
  <Modal title="导出剪映草稿" closable @close="exporter.close">
    <p class="hint">剪映列表<strong>不会扫描文件夹</strong>，只读 <code>com.lveditor.draft/root_meta_info.json</code>。请用「写入剪映草稿目录」，并在弹窗里选这一层目录本身（不要选某个已有草稿）。写完后完全退出剪映再打开。</p>
    <ul class="result-list">
      <li>项目：{{ editor.project.name }}</li>
      <li>素材：{{ editor.project.materials.length }} 个</li>
      <li>片段：{{ editor.project.clips.length }} 个</li>
    </ul>
    <p class="hint">Windows：<code>%LOCALAPPDATA%\JianyingPro\User Data\Projects\com.lveditor.draft\</code><br>macOS：<code>~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft/</code></p>
    <p v-if="!exporter.canPickJianYingDirectory()" class="hint">当前浏览器不能直接写入文件夹，请用 Chrome / Edge。下载 ZIP 后无法自动登记，剪映会扫描不到。</p>
    <p v-if="exporter.error" class="error-message">{{ exporter.error }}</p>
    <p v-if="usedMissing.length" class="error-message">时间轴上有丢失素材（{{ usedMissing.map((item) => item.name).join('、') }}），请先在左侧点「关联」后再导出，否则剪映会显示媒体缺失。</p>
    <template #footer>
      <button type="button" @click="exporter.close">取消</button>
      <button type="button" :disabled="blocked" @click="exporter.startJianYing('zip')">下载 ZIP</button>
      <button type="button" class="primary-button" :disabled="blocked || !exporter.canPickJianYingDirectory()" @click="exporter.startJianYing('directory')">写入剪映草稿目录</button>
    </template>
  </Modal>
</template>
