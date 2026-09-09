<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

const props = withDefaults(defineProps<{ text: string; shortcut?: string; placement?: 'top' | 'bottom' }>(), { placement: 'top' })
const visible = ref(false)
const wrap = ref<HTMLElement>()
const bubble = ref<HTMLElement>()
const style = ref<Record<string, string>>({})
const side = ref<'top' | 'bottom'>('top')
let timer = 0

const label = computed(() => props.shortcut ? `${props.text} · ${props.shortcut}` : props.text)

function place(): void {
  const box = wrap.value?.getBoundingClientRect()
  if (!box) return
  const gap = 8
  const spaceAbove = box.top
  const spaceBelow = window.innerHeight - box.bottom
  const next = props.placement === 'bottom'
    ? (spaceBelow >= 28 || spaceBelow >= spaceAbove ? 'bottom' : 'top')
    : (spaceAbove >= 28 || spaceAbove >= spaceBelow ? 'top' : 'bottom')
  side.value = next
  const width = bubble.value?.offsetWidth ?? 80
  const center = box.left + box.width / 2
  const left = Math.min(window.innerWidth - 12 - width / 2, Math.max(12 + width / 2, center))
  style.value = next === 'bottom'
    ? { top: `${box.bottom + gap}px`, left: `${left}px` }
    : { top: `${box.top - gap}px`, left: `${left}px` }
}

function show(): void {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    visible.value = true
    void nextTick(() => {
      place()
      window.addEventListener('scroll', place, true)
      window.addEventListener('resize', place)
    })
  }, 280)
}
function hide(): void {
  window.clearTimeout(timer)
  visible.value = false
  window.removeEventListener('scroll', place, true)
  window.removeEventListener('resize', place)
}
onBeforeUnmount(hide)
</script>

<template>
  <span ref="wrap" class="ui-tooltip-wrap" @mouseenter="show" @mouseleave="hide" @focusin="show" @focusout="hide">
    <slot />
    <Teleport to="body">
      <span v-if="visible" ref="bubble" class="ui-tooltip" :class="side" role="tooltip" :style="style">{{ label }}</span>
    </Teleport>
  </span>
</template>
