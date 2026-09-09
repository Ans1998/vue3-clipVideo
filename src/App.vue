<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import EditorLayout from '@/components/layout/EditorLayout.vue'
import ErrorBoundary from '@/components/layout/ErrorBoundary.vue'
import { useEditorStore } from '@/stores/editor'
import { isTypingTarget } from '@/utils/dom'
import { isClipInteractable } from '@/utils/timeline/tracks'

const editor = useEditorStore()
const helpOpen = () => document.querySelector<HTMLButtonElement>('[data-action="help"]')?.click()
function onKeydown(event: KeyboardEvent): void {
  if (isTypingTarget(event.target)) return
  if (event.key === '?' || ((event.ctrlKey || event.metaKey) && event.key === '/')) { event.preventDefault(); helpOpen(); return }
  if (event.key === 'Delete' || event.key === 'Backspace') editor.removeSelected()
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? editor.redo() : editor.undo() }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); editor.redo() }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); editor.copySelected() }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') { event.preventDefault(); editor.cutSelected() }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { event.preventDefault(); editor.pasteAtCurrentFrame() }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); editor.duplicateSelected() }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); editor.splitSelectedAtPlayhead() }
  if (event.key === '[' || event.key === ']') {
    if (event.target instanceof HTMLElement && event.target.closest('button')) return
    event.preventDefault()
    if (event.key === '[') editor.splitSelectedLeft()
    else editor.splitSelectedRight()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); editor.selectAllClips() }
  const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as const
  if (event.key in direction) {
    const movable = editor.selectedClipIds.filter((id) => isClipInteractable(editor.project, id))
    if (!movable.length) return
    event.preventDefault()
    const [x, y] = direction[event.key as keyof typeof direction]
    const step = event.shiftKey ? 10 : 1
    editor.commit()
    movable.forEach((id) => {
      const clip = editor.project.clips.find((item) => item.id === id)
      if (clip) editor.updateTransform(id, { x: clip.transform.x + x * step, y: clip.transform.y + y * step })
    })
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <ErrorBoundary>
    <EditorLayout />
  </ErrorBoundary>
</template>
