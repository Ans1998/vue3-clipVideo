import { ref } from 'vue'

type Toggle = () => void

let toggle: Toggle | undefined
let pause: Toggle | undefined
export const previewPlaying = ref(false)

export function bindPreviewPlayback(handler: Toggle, pauseHandler?: Toggle): () => void {
  toggle = handler
  pause = pauseHandler
  return () => {
    if (toggle === handler) toggle = undefined
    if (pause === pauseHandler) pause = undefined
    previewPlaying.value = false
  }
}

export function setPreviewPlaying(playing: boolean): void {
  previewPlaying.value = playing
}

export function togglePreviewPlayback(): void {
  toggle?.()
}

export function pausePreviewPlayback(): void {
  pause?.()
}
