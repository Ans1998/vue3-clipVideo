<script setup lang="ts">
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { ref } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useExportStore } from '@/stores/export'
import { previewPlaying, togglePreviewPlayback } from '@/services/playback/registry'
import { formatRelativeTime } from '@/utils/format'
import { matchingCanvasPreset } from '@/utils/scene/canvas'
import type { ProjectSummary } from '@/types/project'

const emit = defineEmits<{ openLibrary: [] }>()
const editor = useEditorStore()
const exporter = useExportStore()
const menuOpen = ref(false)
const menu = ref<HTMLElement>()
onClickOutside(menu, () => { menuOpen.value = false })
onKeyStroke('Escape', () => { menuOpen.value = false })

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

function commitName(): void {
  const next = editor.project.name.trim() || '未命名项目'
  if (editor.project.name !== next) editor.project.name = next
}

function recentMeta(item: ProjectSummary): string {
  const ratio = matchingCanvasPreset(item.width, item.height)
  const size = ratio === 'custom' ? `${item.width}×${item.height}` : ratio
  return `${size} · ${formatRelativeTime(item.updatedAt)}`
}
</script>

<template>
  <header class="top-toolbar">
    <div class="brand"><span class="brand-mark">▸</span><span>CLIPFORGE</span><span class="brand-version">v1-测试版本</span></div>
    <div ref="menu" class="project-menu" :class="{ open: menuOpen }">
      <div class="project-switcher">
        <input
          v-model="editor.project.name"
          class="project-name"
          placeholder="未命名项目"
          maxlength="60"
          spellcheck="false"
          aria-label="项目名称"
          title="点击修改项目名称"
          @blur="commitName"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
        <button
          type="button"
          class="project-menu-toggle"
          :class="{ open: menuOpen }"
          :aria-expanded="menuOpen"
          aria-haspopup="menu"
          title="项目菜单"
          @click="menuOpen = !menuOpen"
        >▾</button>
      </div>
      <div v-if="menuOpen" class="project-menu-panel" role="menu">
        <button type="button" class="project-menu-action" @click="newProject"><i>＋</i><span>新建项目</span></button>
        <button type="button" class="project-menu-action" @click="openLibrary"><i>☰</i><span>打开全部项目…</span></button>
        <hr class="project-menu-sep" />
        <p class="project-menu-label">最近打开</p>
        <button v-for="item in editor.recentProjects" :key="item.id" type="button" class="recent-item" @click="openRecent(item.id)">
          <img v-if="item.thumbnailUrl" :src="item.thumbnailUrl" alt="" />
          <span v-else class="thumb-fallback">无预览</span>
          <span class="recent-copy">
            <strong>{{ item.name || '未命名项目' }}</strong>
            <small>{{ recentMeta(item) }}</small>
          </span>
        </button>
        <p v-if="!editor.recentProjects.length" class="project-menu-empty">还没有其他项目</p>
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
