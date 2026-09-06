<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { ref } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useExportStore } from '@/stores/export'
import { previewPlaying, togglePreviewPlayback } from '@/services/playback/registry'

const emit = defineEmits<{ openLibrary: [] }>()
const editor = useEditorStore()
const exporter = useExportStore()
const menuOpen = ref(false)
const menu = ref<HTMLElement>()
onClickOutside(menu, () => { menuOpen.value = false })

function newProject(): void {
  menuOpen.value = false
  void editor.newProject()
}

function openLibrary(): void {
  menuOpen.value = false
  emit('openLibrary')
}

function openRecent(id: string): void {
  menuOpen.value = false
  void editor.openProject(id)
}
</script>

<template>
  <header class="top-toolbar">
    <div class="brand"><span class="brand-mark">▸</span><span>CLIPFORGE</span></div>
    <input v-model="editor.project.name" class="project-name" aria-label="项目名称" />
    <div ref="menu" class="project-menu">
      <button type="button" @click="menuOpen = !menuOpen">项目 ▾</button>
      <div v-if="menuOpen" class="project-menu-panel">
        <button type="button" @click="newProject">新建项目</button>
        <button type="button" @click="openLibrary">打开项目...</button>
        <p class="project-menu-label">最近</p>
        <button v-for="item in editor.recentProjects" :key="item.id" type="button" class="recent-item" @click="openRecent(item.id)">
          <img v-if="item.thumbnailUrl" :src="item.thumbnailUrl" alt="" />
          <span v-else class="thumb-fallback" />
          <span>{{ item.name }}</span>
        </button>
        <p v-if="!editor.recentProjects.length" class="project-menu-empty">暂无其他项目</p>
      </div>
    </div>
    <div class="toolbar-actions">
      <button type="button" title="撤销" @click="editor.undo">↶</button>
      <button type="button" title="重做" @click="editor.redo">↷</button>
      <button type="button" class="play-button" title="播放 / 暂停" @click="togglePreviewPlayback">{{ previewPlaying ? '❚❚' : '▶' }}</button>
      <button type="button" class="export-button" @click="exporter.open">导出视频</button>
      <button type="button" class="jianying-button" @click="exporter.openJianYing">导出剪映</button>
    </div>
  </header>
</template>
