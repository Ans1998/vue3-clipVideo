import type { TextConfig } from '@/types/editor'

/** 约 14° 倾斜，中文字体没有斜体字重时也能看出斜体。 */
export const ITALIC_SKEW = Math.tan(14 * Math.PI / 180)

export function canvasFont(text: Pick<TextConfig, 'fontWeight' | 'fontSize' | 'fontFamily'>): string {
  const family = /[\s\d]/.test(text.fontFamily) ? `"${text.fontFamily}"` : text.fontFamily
  return `${text.fontWeight} ${text.fontSize}px ${family}`
}

export function applyItalicSkew(ctx: { transform(a: number, b: number, c: number, d: number, e: number, f: number): void }, italic?: boolean): void {
  if (italic) ctx.transform(1, 0, -ITALIC_SKEW, 1, 0, 0)
}

export function textLineWidth(value: string, letterSpacing: number, measure: (glyph: string) => number): number {
  if (!letterSpacing) return measure(value)
  const glyphs = [...value]
  return glyphs.reduce((sum, glyph) => sum + measure(glyph), 0) + Math.max(0, glyphs.length - 1) * letterSpacing
}

export function textLineStart(align: CanvasTextAlign, width: number): number {
  if (align === 'left' || align === 'start') return 0
  if (align === 'right' || align === 'end') return -width
  return -width / 2
}

export function underlineY(fontSize: number, y: number): number {
  return y + fontSize * 0.42
}
