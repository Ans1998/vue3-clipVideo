<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEditorStore } from '@/stores/editor'
import type { Material, MaterialType } from '@/types/editor'
import { frameToTimecode } from '@/utils/timeline/timecode'

const editor = useEditorStore()
const input = ref<HTMLInputElement>()
const relinkInput = ref<HTMLInputElement>()
const filter = ref<'all' | MaterialType>('all')
const error = ref('')
const draggingFiles = ref(false)
const relinkId = ref('')
const pendingDelete = ref<string | null>(null)
const filtered = computed(() => editor.project.materials.filter((item) => filter.value === 'all' || item.type === filter.value))

async function importFiles(files: File[]): Promise<void> {
  error.value = ''
  for (const file of files) {
    try { await editor.addMaterial(file) }
    catch (reason) { error.value = reason instanceof Error ? reason.message : '素材导入失败' }
  }
}
async function addFiles(event: Event): Promise<void> {
  await importFiles(Array.from((event.target as HTMLInputElement).files ?? []))
  if (input.value) input.value.value = ''
}
function isFileDrag(event: DragEvent): boolean {
  return Boolean(event.dataTransfer?.types.includes('Files') && !editor.dragMaterialId)
}
function onDragOver(event: DragEvent): void {
  if (!isFileDrag(event)) return
  event.preventDefault()
  draggingFiles.value = true
}
function onDragLeave(): void { draggingFiles.value = false }
async function onDrop(event: DragEvent): Promise<void> {
  draggingFiles.value = false
  if (!isFileDrag(event)) return
  event.preventDefault()
  await importFiles(Array.from(event.dataTransfer?.files ?? []))
}
function startRelink(id: string): void {
  relinkId.value = id
  relinkInput.value?.click()
}
async function onRelink(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  const id = relinkId.value
  relinkId.value = ''
  if (relinkInput.value) relinkInput.value.value = ''
  if (!file || !id) return
  error.value = ''
  try { await editor.relinkMaterial(id, file) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '重新关联失败' }
}
async function confirmDelete(): Promise<void> {
  if (!pendingDelete.value) return
  await editor.removeMaterial(pendingDelete.value)
  pendingDelete.value = null
}
function durationLabel(material: Material): string {
  if (material.type === 'image') return `${material.width ?? 0}×${material.height ?? 0}`
  if (!material.durationFrames) return ''
  return frameToTimecode(material.durationFrames, editor.project.settings.fps)
}
</script>

<template>
  <div class="panel-heading"><span>素材</span><button class="icon-button" title="导入素材" @click="input?.click()">＋</button></div>
  <input ref="input" hidden type="file" multiple accept="video/*,audio/*,image/*" @change="addFiles" />
  <input ref="relinkInput" hidden type="file" accept="video/*,audio/*,image/*" @change="onRelink" />
  <div class="material-tabs"><button v-for="tab in [{ id: 'all', name: '全部' }, { id: 'video', name: '视频' }, { id: 'image', name: '图片' }, { id: 'audio', name: '音频' }]" :key="tab.id" :class="{ active: filter === tab.id }" @click="filter = tab.id as 'all' | MaterialType">{{ tab.name }}</button></div>
  <button class="upload-zone" :class="{ dragging: draggingFiles }" @click="input?.click()" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop"><span>⇧</span><b>导入本地素材</b><small>拖入或点击选择视频、图片、音频</small></button>
  <p v-if="error" class="error-message">{{ error }}</p>
  <div class="material-list" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <div v-for="material in filtered" :key="material.id" class="material-row">
      <button class="material-item" draggable="true" @dragstart="editor.dragMaterialId = material.id; $event.dataTransfer?.setData('application/x-clipforge-material', material.id)" @dragend="editor.dragMaterialId = ''" @dblclick="editor.addClip(material)">
        <img v-if="material.type === 'image' && material.objectUrl && !material.missing" class="material-thumb" :src="material.objectUrl" alt="" />
        <span v-else class="material-type">{{ material.type === 'video' ? 'VID' : material.type === 'image' ? 'IMG' : 'AUD' }}</span>
        <span class="material-copy">
          <span class="material-name">{{ material.name }}</span>
          <small v-if="durationLabel(material)">{{ durationLabel(material) }}</small>
        </span>
        <span v-if="material.missing" class="material-missing">丢失</span>
        <span class="material-add">＋</span>
      </button>
      <button v-if="material.missing" type="button" class="material-action" title="重新关联文件" @click="startRelink(material.id)">关联</button>
      <button type="button" class="material-action danger" title="删除素材" @click="pendingDelete = material.id">×</button>
    </div>
    <p v-if="!filtered.length" class="empty-state">暂无素材<br />拖入视频、图片或音频</p>
  </div>
  <div v-if="pendingDelete" class="material-confirm">
    <span>删除后，使用该素材的片段也会移除。</span>
    <button type="button" @click="pendingDelete = null">取消</button>
    <button type="button" class="danger-button" @click="confirmDelete">删除</button>
  </div>
  <button class="add-text" @click="editor.addText">T　添加文字</button>
</template>
