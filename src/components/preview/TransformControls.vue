<script setup lang="ts">
import type { Transform } from '@/types/editor'

const props = defineProps<{ transform: Transform; zoom: number }>()
defineEmits<{ handleDown: [event: PointerEvent, handle: string] }>()

const style = () => ({
  left: `${props.transform.x * props.zoom}px`, top: `${props.transform.y * props.zoom}px`,
  width: `${props.transform.width * props.transform.scaleX * props.zoom}px`, height: `${props.transform.height * props.transform.scaleY * props.zoom}px`,
  transform: `translate(-50%, -50%) rotate(${props.transform.rotation}deg)`,
})
</script>

<template>
  <div class="transform-controls" :style="style()">
    <button v-for="handle in ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']" :key="handle" :class="`transform-handle handle-${handle}`" :aria-label="`调整 ${handle}`" @pointerdown="$emit('handleDown', $event, handle)" />
    <span class="rotate-stem" /><button class="rotate-handle" aria-label="旋转" @pointerdown="$emit('handleDown', $event, 'rotate')">↻</button>
    <span class="transform-size">{{ Math.round(transform.width * transform.scaleX) }} × {{ Math.round(transform.height * transform.scaleY) }}</span>
  </div>
</template>
