export type RulerTickKind = 'major' | 'minor' | 'micro'

export interface RulerTick {
  frame: number
  kind: RulerTickKind
  label?: string
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.filter((value) => value >= 1))].sort((left, right) => left - right)
}

export function rulerStepCandidates(fps: number): number[] {
  const second = Math.max(1, Math.round(fps))
  return uniqueSorted([
    1,
    2,
    5,
    Math.round(second / 10) || 1,
    Math.round(second / 5) || 1,
    Math.round(second / 2) || 1,
    second,
    second * 2,
    second * 5,
    second * 10,
    second * 15,
    second * 30,
    second * 60,
    second * 120,
    second * 300,
  ])
}

export function majorRulerStep(pixelsPerFrame: number, fps: number, minMajorPx = 72): number {
  const needed = minMajorPx / Math.max(0.01, pixelsPerFrame)
  const steps = rulerStepCandidates(fps)
  return steps.find((step) => step >= needed) ?? steps[steps.length - 1]
}

export function formatRulerLabel(frame: number, fps: number): string {
  const value = Math.max(0, Math.floor(frame))
  if (value === 0) return '0'
  const ff = value % fps
  const totalSeconds = Math.floor(value / fps)
  const ss = totalSeconds % 60
  const mm = Math.floor(totalSeconds / 60) % 60
  const hh = Math.floor(totalSeconds / 3600)
  const pad = (part: number) => String(part).padStart(2, '0')
  if (hh > 0) return ff ? `${hh}:${pad(mm)}:${pad(ss)}.${pad(ff)}` : `${hh}:${pad(mm)}:${pad(ss)}`
  if (ff) return totalSeconds === 0 ? `${ff}f` : mm > 0 ? `${mm}:${pad(ss)}:${pad(ff)}` : `${ss}:${pad(ff)}`
  return mm > 0 ? `${mm}:${pad(ss)}` : `${ss}s`
}

function nestedStep(major: number, pixelsPerFrame: number, minPx: number, divisors: number[]): number | null {
  const options = divisors.map((divisor) => major / divisor).filter((step) => step >= 1 && Number.isInteger(step) && step * pixelsPerFrame >= minPx)
  return options.length ? Math.min(...options) : null
}

export function buildRulerTicks(
  durationFrames: number,
  pixelsPerFrame: number,
  fps: number,
  viewStart = 0,
  viewEnd = durationFrames,
): RulerTick[] {
  const major = majorRulerStep(pixelsPerFrame, fps)
  const minor = nestedStep(major, pixelsPerFrame, 8, [2, 5, 10])
  const micro = nestedStep(minor ?? major, pixelsPerFrame, 5, [2, 5, 10])
  const finest = micro ?? minor ?? major
  const start = Math.max(0, Math.floor(viewStart / finest) * finest)
  const end = Math.min(durationFrames, Math.max(start, Math.ceil(viewEnd / finest) * finest))
  const ticks: RulerTick[] = []
  for (let frame = start; frame <= end; frame += finest) {
    const kind: RulerTickKind = frame % major === 0 ? 'major' : minor && frame % minor === 0 ? 'minor' : 'micro'
    ticks.push({ frame, kind, label: kind === 'major' ? formatRulerLabel(frame, fps) : undefined })
  }
  return ticks
}
