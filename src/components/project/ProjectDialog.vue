<script setup lang="ts">
import { computed, ref } from 'vue'
import Modal from '@/components/layout/Modal.vue'
import { useEditorStore } from '@/stores/editor'
import { formatBytes, formatDateTime } from '@/utils/format'

const emit = defineEmits<{ close: [] }>()
const editor = useEditorStore()
const tab = ref<'active' | 'trash'>('active')
const pendingDelete = ref<string | null>(null)
const renaming = ref<string | null>(null)
const renameValue = ref('')
const quotaLabel = computed(() => {
  if (!editor.quota.quota) return '存储用量未知'
  return `已用 ${formatBytes(editor.quota.usage)} / ${formatBytes(editor.quota.quota)}`
})

async function open(id: string): Promise<void> {
  await editor.openProject(id)
  emit('close')
}

async function create(): Promise<void> {
  await editor.newProject()
  emit('close')
}

function beginRename(id: string, name: string): void {
  renaming.value = id
  renameValue.value = name
}

async function commitRename(): Promise<void> {
  if (!renaming.value) return
  await editor.renameProject(renaming.value, renameValue.value)
  renaming.value = null
}

async function remove(id: string): Promise<void> {
  await editor.trashProject(id)
  pendingDelete.value = null
}
</script>

<template>
  <Modal title="项目" wide closable @close="emit('close')">
    <div class="project-toolbar">
      <div class="material-tabs">
        <button type="button" :class="{ active: tab === 'active' }" @click="tab = 'active'">项目</button>
        <button type="button" :class="{ active: tab === 'trash' }" @click="tab = 'trash'">回收站</button>
      </div>
      <span>{{ quotaLabel }}</span>
    </div>
    <p v-if="editor.quota.quota && editor.quota.usage / editor.quota.quota > 0.8" class="error-message">本地存储较满，删除回收站项目可释放素材占用。</p>
    <template v-if="tab === 'active'">
      <div class="project-toolbar"><button type="button" class="primary-button" @click="create">新建项目</button><span>{{ editor.summaries.length }} 个项目</span></div>
      <div v-if="editor.summaries.length" class="project-grid">
        <article v-for="item in editor.summaries" :key="item.id" class="project-card" :class="{ current: item.id === editor.project.id }">
          <button type="button" class="project-thumb" :aria-label="`打开 ${item.name}`" @click="open(item.id)">
            <img v-if="item.thumbnailUrl" :src="item.thumbnailUrl" :alt="item.name" />
            <span v-else>暂无画面</span>
          </button>
          <div class="project-meta">
            <input v-if="renaming === item.id" v-model="renameValue" @blur="commitRename" @keydown.enter="commitRename" />
            <strong v-else @dblclick="beginRename(item.id, item.name)">{{ item.name }}</strong>
            <small>{{ item.width }}×{{ item.height }} · {{ item.fps }} FPS</small>
            <small>修改于 {{ formatDateTime(item.updatedAt) }}</small>
          </div>
          <div class="project-card-actions">
            <button type="button" @click="open(item.id)">{{ item.id === editor.project.id ? '当前项目' : '打开' }}</button>
            <button type="button" @click="beginRename(item.id, item.name)">重命名</button>
            <button type="button" class="danger-button" @click="pendingDelete = item.id">删除</button>
          </div>
        </article>
      </div>
      <p v-else class="empty-state">还没有项目，创建一个开始编辑</p>
    </template>
    <template v-else>
      <div v-if="editor.trashSummaries.length" class="project-grid">
        <article v-for="item in editor.trashSummaries" :key="item.id" class="project-card">
          <div class="project-meta">
            <strong>{{ item.name }}</strong>
            <small>删除于 {{ item.deletedAt ? formatDateTime(item.deletedAt) : '-' }}</small>
          </div>
          <div class="project-card-actions">
            <button type="button" class="primary-button" @click="editor.restoreProject(item.id)">恢复</button>
            <button type="button" class="danger-button" @click="editor.purgeProject(item.id)">彻底删除</button>
          </div>
        </article>
      </div>
      <p v-else class="empty-state">回收站是空的</p>
    </template>
    <div v-if="pendingDelete" class="confirm-bar">
      <span>将移入回收站，素材会保留直到彻底删除。</span>
      <button type="button" @click="pendingDelete = null">取消</button>
      <button type="button" class="danger-button" @click="remove(pendingDelete)">移入回收站</button>
    </div>
  </Modal>
</template>
