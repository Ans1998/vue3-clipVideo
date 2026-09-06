import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'
import { ref } from 'vue'

export type NotifyKind = 'info' | 'warn' | 'error' | 'success'

export interface Notice {
  id: string
  kind: NotifyKind
  text: string
}

export const useNotifyStore = defineStore('notify', () => {
  const notices = ref<Notice[]>([])

  function push(kind: NotifyKind, text: string, timeout = 4200): void {
    const id = nanoid()
    notices.value = [...notices.value.slice(-4), { id, kind, text }]
    window.setTimeout(() => dismiss(id), timeout)
  }

  function dismiss(id: string): void {
    notices.value = notices.value.filter((item) => item.id !== id)
  }

  return { notices, push, dismiss }
})
