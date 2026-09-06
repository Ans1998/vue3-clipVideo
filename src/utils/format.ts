export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const mm = Math.floor(total / 60)
  const ss = total % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}

export function formatDateTime(value: number): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').trim() || 'clipforge-export'
}

export function containRect(sourceWidth: number, sourceHeight: number, destWidth: number, destHeight: number): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(destWidth / sourceWidth, destHeight / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  return { x: (destWidth - width) / 2, y: (destHeight - height) / 2, width, height }
}
