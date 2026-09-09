import type { ClipFilter, ClipTransition, ClipTransitionKind, TimelineClip } from '@/types/editor'
import { DEFAULT_FILTER, DEFAULT_TRANSITION } from '@/types/editor'

export const MIN_CLIP_SPEED = 0.1
export const MAX_CLIP_SPEED = 8

export function clipSpeed(clip: Pick<TimelineClip, 'speed'>): number {
  const speed = clip.speed ?? 1
  if (!Number.isFinite(speed)) return 1
  return Math.min(MAX_CLIP_SPEED, Math.max(MIN_CLIP_SPEED, speed))
}

export function sourceConsumed(clip: Pick<TimelineClip, 'durationFrames' | 'speed'>): number {
  return clip.durationFrames * clipSpeed(clip)
}

export function durationForSpeed(sourceFrames: number, speed: number): number {
  return Math.max(1, Math.round(sourceFrames / clipSpeed({ speed })))
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function easeOutCubic(value: number): number {
  const t = clamp01(value)
  return 1 - (1 - t) ** 3
}

function easeInCubic(value: number): number {
  const t = clamp01(value)
  return t ** 3
}

export function resolvedTransition(clip: Pick<TimelineClip, 'fadeInFrames' | 'fadeOutFrames' | 'transitionIn' | 'transitionOut'>, side: 'in' | 'out'): ClipTransition {
  const current = side === 'in' ? clip.transitionIn : clip.transitionOut
  if (current?.kind && current.kind !== 'none') {
    return { kind: current.kind, durationFrames: Math.max(0, Math.round(current.durationFrames || 0)) }
  }
  const fade = side === 'in' ? clip.fadeInFrames ?? 0 : clip.fadeOutFrames ?? 0
  if (fade > 0) return { kind: 'fade', durationFrames: fade }
  return { kind: 'none', durationFrames: current?.durationFrames ?? DEFAULT_TRANSITION.durationFrames }
}

export function transitionLabel(kind: ClipTransitionKind, side: 'in' | 'out'): string {
  if (kind === 'none') return ''
  if (kind === 'fade') return side === 'in' ? '淡入' : '淡出'
  if (kind === 'zoom') return side === 'in' ? '放大' : '缩小'
  if (kind === 'slide-left') return side === 'in' ? '左进' : '左出'
  if (kind === 'slide-right') return side === 'in' ? '右进' : '右出'
  if (kind === 'slide-up') return side === 'in' ? '上进' : '上出'
  return side === 'in' ? '下进' : '下出'
}

export function clipMotion(
  clip: Pick<TimelineClip, 'startFrame' | 'durationFrames' | 'fadeInFrames' | 'fadeOutFrames' | 'transitionIn' | 'transitionOut'>,
  frame: number,
  canvasWidth: number,
  canvasHeight: number,
): { opacity: number; dx: number; dy: number; scale: number } {
  const local = frame - clip.startFrame
  let opacity = 1
  let dx = 0
  let dy = 0
  let scale = 1
  const intro = resolvedTransition(clip, 'in')
  if (intro.kind !== 'none' && intro.durationFrames > 0) {
    if (intro.kind === 'fade') opacity *= clamp01(local / intro.durationFrames)
    else applyTransition(intro.kind, 1 - easeOutCubic(local / intro.durationFrames), canvasWidth, canvasHeight, true)
  }
  const outro = resolvedTransition(clip, 'out')
  if (outro.kind !== 'none' && outro.durationFrames > 0) {
    const remaining = clip.durationFrames - local
    if (outro.kind === 'fade') opacity *= clamp01(remaining / outro.durationFrames)
    else applyTransition(outro.kind, easeInCubic(1 - remaining / outro.durationFrames), canvasWidth, canvasHeight, false)
  }
  return { opacity, dx, dy, scale }

  function applyTransition(kind: ClipTransitionKind, amount: number, width: number, height: number, entering: boolean): void {
    const travel = clamp01(amount)
    if (kind === 'zoom') {
      scale *= entering ? 0.55 + 0.45 * (1 - travel) : 1 - 0.45 * travel
      if (entering) opacity *= 1 - travel * 0.35
      return
    }
    const distanceX = Math.max(width, 1)
    const distanceY = Math.max(height, 1)
    if (kind === 'slide-left') dx += -distanceX * travel
    if (kind === 'slide-right') dx += distanceX * travel
    if (kind === 'slide-up') dy += -distanceY * travel
    if (kind === 'slide-down') dy += distanceY * travel
  }
}

export function visualFade(clip: Pick<TimelineClip, 'startFrame' | 'durationFrames' | 'fadeInFrames' | 'fadeOutFrames' | 'transitionIn' | 'transitionOut'>, frame: number): number {
  return clipMotion(clip, frame, 1, 1).opacity
}

export function audioFade(clip: Pick<TimelineClip, 'startFrame' | 'durationFrames' | 'fadeInFrames' | 'fadeOutFrames' | 'audio'>, frame: number): number {
  return visualFade({
    startFrame: clip.startFrame,
    durationFrames: clip.durationFrames,
    fadeInFrames: clip.audio?.fadeInFrames ?? clip.fadeInFrames ?? 0,
    fadeOutFrames: clip.audio?.fadeOutFrames ?? clip.fadeOutFrames ?? 0,
  }, frame)
}

export function clipFilter(clip: Pick<TimelineClip, 'filter'>): ClipFilter {
  return {
    brightness: clip.filter?.brightness ?? DEFAULT_FILTER.brightness,
    contrast: clip.filter?.contrast ?? DEFAULT_FILTER.contrast,
    saturation: clip.filter?.saturation ?? DEFAULT_FILTER.saturation,
  }
}

export function canvasFilter(clip: Pick<TimelineClip, 'filter'>): string {
  const filter = clipFilter(clip)
  if (filter.brightness === 1 && filter.contrast === 1 && filter.saturation === 1) return 'none'
  return `brightness(${filter.brightness}) contrast(${filter.contrast}) saturate(${filter.saturation})`
}
