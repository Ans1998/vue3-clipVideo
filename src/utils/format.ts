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

export function formatRelativeTime(value: number, now = Date.now()): string {
  const delta = Math.max(0, now - value)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (delta < minute) return '刚刚'
  if (delta < hour) return `${Math.floor(delta / minute)} 分钟前`
  if (delta < day) return `${Math.floor(delta / hour)} 小时前`
  if (delta < 7 * day) return `${Math.floor(delta / day)} 天前`
  return new Date(value).toLocaleDateString('zh-CN')
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
