<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'

const error = ref<Error | null>(null)

onErrorCaptured((reason) => {
  error.value = reason instanceof Error ? reason : new Error(String(reason))
  return false
})

function retry(): void {
  error.value = null
}
</script>

<template>
  <slot v-if="!error" />
  <div v-else class="error-boundary">
    <strong>编辑器遇到错误</strong>
    <p>{{ error.message }}</p>
    <button type="button" class="primary-button" @click="retry">重新加载界面</button>
  </div>
</template>
