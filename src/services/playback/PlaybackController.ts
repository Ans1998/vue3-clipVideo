export interface PlaybackTarget {
  fps(): number
  currentFrame(): number
  durationFrames(): number
  setCurrentFrame(frame: number): void
  onFrame?(): void
  onPlayState?(playing: boolean): void
}

export class PlaybackController {
  private frameRequest = 0
  private lastTimestamp = 0
  private remainder = 0
  private playing = false

  constructor(private readonly target: PlaybackTarget) {}

  get isPlaying(): boolean { return this.playing }

  play(): void {
    if (this.playing) return
    if (this.target.currentFrame() >= this.target.durationFrames() - 1) this.target.setCurrentFrame(0)
    this.playing = true; this.lastTimestamp = performance.now(); this.remainder = 0; this.target.onPlayState?.(true)
    this.frameRequest = requestAnimationFrame(this.tick)
  }

  pause(): void {
    if (!this.playing) return
    this.playing = false; cancelAnimationFrame(this.frameRequest); this.target.onPlayState?.(false)
  }

  toggle(): void { this.playing ? this.pause() : this.play() }

  dispose(): void { this.pause() }

  private tick = (timestamp: number): void => {
    if (!this.playing) return
    const elapsedFrames = ((timestamp - this.lastTimestamp) / 1000) * this.target.fps() + this.remainder
    const wholeFrames = Math.floor(elapsedFrames)
    this.remainder = elapsedFrames - wholeFrames; this.lastTimestamp = timestamp
    if (wholeFrames > 0) {
      const next = this.target.currentFrame() + wholeFrames
      if (next >= this.target.durationFrames()) { this.target.setCurrentFrame(this.target.durationFrames() - 1); this.target.onFrame?.(); this.pause(); return }
      this.target.setCurrentFrame(next); this.target.onFrame?.()
    }
    this.frameRequest = requestAnimationFrame(this.tick)
  }
}
