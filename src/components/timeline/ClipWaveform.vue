<script setup lang="ts">
import { ref, watch } from 'vue'
import { materialPeaks } from '@/services/audio/waveform'

const props = defineProps<{ materialId: string }>()
const peaks = ref<number[]>([])

watch(() => props.materialId, async (id) => {
  peaks.value = id ? await materialPeaks(id) : []
}, { immediate: true })
</script>

<template>
  <span v-if="peaks.length" class="clip-wave" aria-hidden="true">
    <i v-for="(peak, index) in peaks" :key="index" :style="{ height: `${Math.max(12, peak * 100)}%` }" />
  </span>
</template>
