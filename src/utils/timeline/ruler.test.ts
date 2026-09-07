import { describe, expect, it } from 'vitest'
import { buildRulerTicks, formatRulerLabel, majorRulerStep } from '@/utils/timeline/ruler'

describe('timeline ruler', () => {
  it('widens the major step when the timeline is zoomed out', () => {
    expect(majorRulerStep(4, 30)).toBe(30)
    expect(majorRulerStep(0.4, 30)).toBeGreaterThan(30)
  })

  it('uses compact time labels on major ticks', () => {
    expect(formatRulerLabel(0, 30)).toBe('0')
    expect(formatRulerLabel(30, 30)).toBe('1s')
    expect(formatRulerLabel(90, 30)).toBe('3s')
    expect(formatRulerLabel(1800, 30)).toBe('1:00')
    expect(formatRulerLabel(15, 30)).toBe('15f')
  })

  it('builds major, minor and micro ticks inside the viewport', () => {
    const ticks = buildRulerTicks(300, 8, 30, 0, 90)
    expect(ticks.some((tick) => tick.kind === 'major' && tick.label === '0')).toBe(true)
    expect(ticks.some((tick) => tick.kind === 'major' && tick.label === '1s')).toBe(true)
    expect(ticks.some((tick) => tick.kind === 'minor' || tick.kind === 'micro')).toBe(true)
    expect(ticks.every((tick) => tick.frame >= 0 && tick.frame <= 90)).toBe(true)
  })
})
