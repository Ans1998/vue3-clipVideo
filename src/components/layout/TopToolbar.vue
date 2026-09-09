<script setup lang="ts">
import { computed, ref } from 'vue'
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { useEditorStore } from '@/stores/editor'
import { useExportStore } from '@/stores/export'
import { formatRelativeTime } from '@/utils/format'
import { matchingCanvasPreset } from '@/utils/scene/canvas'
import type { ProjectSummary } from '@/types/project'
import UiIcon from '@/components/layout/UiIcon.vue'
import UiTooltip from '@/components/layout/UiTooltip.vue'

const emit = defineEmits<{ openLibrary: []; openHelp: [] }>()
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

const sizeLabel = computed(() => {
  const { width, height } = editor.project.settings
  if (width === 1920 && height === 1080) return '1080p'
  if (width === 1280 && height === 720) return '720p'
  if (width === 3840 && height === 2160) return '4K'
  if (width === 1080 && height === 1920) return '1080p 竖'
  return `${width}×${height}`
})

const savedLabel = computed(() => `已保存 · ${formatRelativeTime(editor.project.updatedAt)}`)
</script>

<template>
  <header class="top-toolbar">
    <div class="brand">
      <span class="brand-mark"><UiIcon name="brand" :size="12" /></span>
      <span>CLIPFORGE</span>
      <span class="brand-version">v1-测试版本</span>
    </div>
    <div ref="menu" class="project-menu" :class="{ open: menuOpen }">
      <div class="project-switcher">
        <input
          v-model="editor.project.name"
          class="project-name"
          placeholder="未命名项目"
          maxlength="60"
          spellcheck="false"
          aria-label="项目名称"
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
        ><UiIcon name="chevron" :size="12" /></button>
      </div>
      <div v-if="menuOpen" class="project-menu-panel" role="menu">
        <button type="button" class="project-menu-action" @click="newProject"><span class="menu-icon"><UiIcon name="filePlus" /></span><span>新建项目</span></button>
        <button type="button" class="project-menu-action" @click="openLibrary"><span class="menu-icon"><UiIcon name="folder" /></span><span>打开全部项目…</span></button>
        <hr class="project-menu-sep" />
        <p class="project-menu-label">最近打开</p>
        <button v-for="item in editor.recentProjects" :key="item.id" type="button" class="recent-item" @click="openRecent(item.id)">
          <span class="recent-thumb">
            <img v-if="item.thumbnailUrl" :src="item.thumbnailUrl" alt="" />
            <span v-else class="thumb-fallback"><UiIcon name="video" :size="18" /><span>无预览</span></span>
          </span>
          <span class="recent-copy">
            <strong>{{ item.name || '未命名项目' }}</strong>
            <small>{{ recentMeta(item) }}</small>
          </span>
        </button>
        <p v-if="!editor.recentProjects.length" class="project-menu-empty">还没有其他项目</p>
      </div>
    </div>
    <div class="toolbar-meta">
      <span class="tabular">{{ sizeLabel }} · {{ editor.project.settings.fps }} FPS</span>
      <span>{{ savedLabel }}</span>
    </div>
    <div class="toolbar-actions">
      <UiTooltip text="撤销" shortcut="Ctrl+Z" placement="bottom">
        <button type="button" class="btn-icon" aria-label="撤销" @click="editor.undo"><UiIcon name="undo" /></button>
      </UiTooltip>
      <UiTooltip text="重做" shortcut="Ctrl+Y" placement="bottom">
        <button type="button" class="btn-icon" aria-label="重做" @click="editor.redo"><UiIcon name="redo" /></button>
      </UiTooltip>
      <UiTooltip text="快捷键" shortcut="?" placement="bottom">
        <button type="button" class="btn-icon" data-action="help" aria-label="快捷键" @click="emit('openHelp')"><UiIcon name="help" /></button>
      </UiTooltip>
      <span class="toolbar-sep" />
      <button type="button" class="btn-primary export-button" @click="exporter.open">导出视频</button>
      <button type="button" class="btn-ghost" @click="exporter.openJianYing">导出剪映</button>
    </div>
  </header>
</template>
