<script setup lang="ts">
import { onMounted, ref } from 'vue'
import MaterialPanel from '@/components/material/MaterialPanel.vue'
import PreviewStage from '@/components/preview/PreviewStage.vue'
import InspectorPanel from '@/components/inspector/InspectorPanel.vue'
import Timeline from '@/components/timeline/Timeline.vue'
import TopToolbar from '@/components/layout/TopToolbar.vue'
import ToastHost from '@/components/layout/ToastHost.vue'
import ProjectDialog from '@/components/project/ProjectDialog.vue'
import ExportVideoDialog from '@/components/export/ExportVideoDialog.vue'
import ExportProgress from '@/components/export/ExportProgress.vue'
import ExportResult from '@/components/export/ExportResult.vue'
import JianYingExportDialog from '@/components/export/JianYingExportDialog.vue'
import ShortcutsDialog from '@/components/layout/ShortcutsDialog.vue'
import { useEditorStore } from '@/stores/editor'
import { useExportStore } from '@/stores/export'

const editor = useEditorStore()
const exporter = useExportStore()
const libraryOpen = ref(false)
const previewExpanded = ref(false)
const helpOpen = ref(false)
const leftCollapsed = ref(false)
const rightCollapsed = ref(false)
onMounted(() => { void editor.initialize() })
</script>

<template>
  <main :class="['editor-shell', { 'preview-expanded': previewExpanded, 'left-collapsed': leftCollapsed, 'right-collapsed': rightCollapsed }]">
    <div v-if="!editor.ready" class="boot-overlay">正在加载项目...</div>
    <ToastHost />
    <TopToolbar @open-library="libraryOpen = true" @open-help="helpOpen = true" />
    <p v-if="editor.missingMaterials.length" class="banner-warn">{{ editor.missingMaterials.length }} 个素材丢失，可在左侧素材列表点击「关联」重新选择文件。时间轴片段会保留。</p>
    <section class="workspace">
      <aside class="left-panel" :class="{ collapsed: leftCollapsed }">
        <MaterialPanel :collapsed="leftCollapsed" @toggle-collapse="leftCollapsed = !leftCollapsed" />
      </aside>
      <section class="preview-panel"><PreviewStage :expanded="previewExpanded" @toggle-expand="previewExpanded = !previewExpanded" /></section>
      <aside class="right-panel" :class="{ collapsed: rightCollapsed }">
        <InspectorPanel :collapsed="rightCollapsed" @toggle-collapse="rightCollapsed = !rightCollapsed" />
      </aside>
    </section>
    <section class="timeline-panel"><Timeline /></section>
    <ShortcutsDialog v-if="helpOpen" @close="helpOpen = false" />
    <ProjectDialog v-if="libraryOpen" @close="libraryOpen = false" />
    <ExportVideoDialog v-if="exporter.dialogOpen && exporter.view === 'settings'" />
    <JianYingExportDialog v-if="exporter.jianyingOpen && exporter.view === 'settings'" />
    <ExportProgress v-if="(exporter.dialogOpen || exporter.jianyingOpen) && exporter.view === 'progress'" />
    <ExportResult v-if="(exporter.dialogOpen || exporter.jianyingOpen) && exporter.view === 'result'" />
  </main>
</template>
