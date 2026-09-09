<script setup lang="ts">
import { computed } from 'vue'
import type { Transform } from '@/types/editor'
import { selectionOverlayFrame } from '@/utils/scene/selectionOverlay'

const props = defineProps<{ transform: Transform; zoom: number; canvasWidth: number; canvasHeight: number; rotate?: boolean }>()
defineEmits<{ handleDown: [event: PointerEvent, handle: string] }>()

const CORNERS = ['nw', 'ne', 'se', 'sw'] as const
const EDGES = ['n', 'e', 's', 'w'] as const

const frame = computed(() => selectionOverlayFrame(props.transform, props.zoom, props.canvasWidth, props.canvasHeight))
const compact = computed(() => !frame.value || frame.value.width < 40 || frame.value.height < 40)
const style = computed(() => {
  const box = frame.value
  if (!box) return { display: 'none' }
  return {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
  }
})
</script>

<template>
  <div v-if="frame" class="transform-controls" :class="{ compact }" :style="style">
    <button v-for="handle in CORNERS" :key="handle" :class="`transform-handle handle-${handle}`" :aria-label="`调整 ${handle}`" @pointerdown="$emit('handleDown', $event, handle)" />
    <button v-for="handle in EDGES" v-show="!compact" :key="handle" :class="`transform-handle handle-${handle}`" :aria-label="`调整 ${handle}`" @pointerdown="$emit('handleDown', $event, handle)" />
    <button v-if="rotate !== false" class="rotate-handle" aria-label="旋转" @pointerdown="$emit('handleDown', $event, 'rotate')" />
    <span class="transform-size">{{ Math.round(transform.width * transform.scaleX) }} × {{ Math.round(transform.height * transform.scaleY) }}</span>
  </div>
</template>
