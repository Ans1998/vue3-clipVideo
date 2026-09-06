<script setup lang="ts">
const props = defineProps<{ title: string; wide?: boolean; closable?: boolean }>()
const emit = defineEmits<{ close: [] }>()
function onOverlay(event: MouseEvent): void {
  if (props.closable === false) return
  if ((event.target as HTMLElement).classList.contains('modal-overlay')) emit('close')
}
</script>

<template>
  <div class="modal-overlay" @mousedown="onOverlay">
    <div class="modal" :class="{ wide }" role="dialog" aria-modal="true" @mousedown.stop>
      <header class="modal-header">
        <h2>{{ title }}</h2>
        <button v-if="closable !== false" class="modal-close" type="button" aria-label="关闭" @click="emit('close')">×</button>
      </header>
      <div class="modal-body"><slot /></div>
      <footer v-if="$slots.footer" class="modal-footer"><slot name="footer" /></footer>
    </div>
  </div>
</template>
