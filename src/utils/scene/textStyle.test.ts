import { describe, expect, it } from 'vitest'
import { createDefaultText } from '@/types/editor'
import { canvasFont, applyItalicSkew, textLineStart, textLineWidth, underlineY } from '@/utils/scene/textStyle'

describe('textStyle', () => {
  it('builds canvas font with quoted family names', () => {
    expect(canvasFont({ fontWeight: 700, fontSize: 72, fontFamily: 'Arial' })).toBe('700 72px Arial')
    expect(canvasFont({ fontWeight: 400, fontSize: 32, fontFamily: 'Microsoft YaHei' })).toBe('400 32px "Microsoft YaHei"')
  })

  it('measures spaced glyphs and decoration anchors', () => {
    expect(textLineWidth('ab', 10, (glyph) => glyph === 'a' ? 8 : 12)).toBe(30)
    expect(textLineStart('center', 100)).toBe(-50)
    expect(textLineStart('right', 100)).toBe(-100)
    expect(underlineY(40, 10)).toBeCloseTo(26.8)
  })

  it('defaults new text without decorations', () => {
    expect(createDefaultText()).toMatchObject({ italic: false, underline: false, strikethrough: false })
  })

  it('applies a horizontal skew for italic', () => {
    const calls: number[][] = []
    applyItalicSkew({ transform: (...args: number[]) => { calls.push(args) } }, true)
    applyItalicSkew({ transform: (...args: number[]) => { calls.push(args) } }, false)
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe(1)
    expect(calls[0][2]).toBeLessThan(0)
  })
})
