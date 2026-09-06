<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref } from 'vue'

export interface MenuItem {
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  separator?: boolean
}

const props = defineProps<{ x: number; y: number; items: MenuItem[] }>()
const emit = defineEmits<{ close: []; select: [id: string] }>()
const root = ref<HTMLElement>()
onClickOutside(root, () => emit('close'))

const style = computed(() => {
  const width = 220
  const height = props.items.length * 34 + 12
  return {
    left: `${Math.max(8, Math.min(props.x, window.innerWidth - width - 8))}px`,
    top: `${Math.max(8, Math.min(props.y, window.innerHeight - height - 8))}px`,
  }
})

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

function choose(item: MenuItem): void {
  if (item.disabled || item.separator) return
  emit('select', item.id)
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="context-menu-overlay" @contextmenu.prevent="emit('close')">
      <div ref="root" class="context-menu" role="menu" :style="style" @mousedown.stop>
        <template v-for="item in items" :key="item.id">
          <hr v-if="item.separator" class="context-menu-sep" />
          <button v-else type="button" role="menuitem" :disabled="item.disabled" :class="{ danger: item.danger }" @click="choose(item)">
            <span>{{ item.label }}</span>
            <kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>
