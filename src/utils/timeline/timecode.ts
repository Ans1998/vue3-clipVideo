export function frameToTimecode(frame: number, fps: number): string {
  const value = Math.max(0, Math.floor(frame))
  const ff = value % fps
  const totalSeconds = Math.floor(value / fps)
  const ss = totalSeconds % 60
  const mm = Math.floor(totalSeconds / 60) % 60
  const hh = Math.floor(totalSeconds / 3600)
  return [hh, mm, ss, ff].map((part) => String(part).padStart(2, '0')).join(':')
}

export function timecodeToFrame(value: string, fps: number): number | null {
  const parts = value.split(':').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0)) return null
  const [hh, mm, ss, ff] = parts
  if (mm > 59 || ss > 59 || ff >= fps) return null
  return (((hh * 60 + mm) * 60 + ss) * fps) + ff
}
