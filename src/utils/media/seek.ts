export function frameTime(frame: number, fps: number): number {
  return (Math.max(0, frame) + 0.5) / fps
}

export async function seekMediaToFrame(media: HTMLMediaElement, frame: number, fps: number, timeoutMs = 800): Promise<void> {
  if (!Number.isFinite(media.duration) || media.duration <= 0) return
  const time = Math.min(Math.max(0, frameTime(frame, fps)), Math.max(0, media.duration - 1 / fps))
  if (Math.abs(media.currentTime - time) < 1 / fps / 3 && !media.seeking) return
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      media.removeEventListener('seeked', finish)
      media.removeEventListener('error', finish)
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(finish, timeoutMs)
    media.addEventListener('seeked', finish, { once: true })
    media.addEventListener('error', finish, { once: true })
    try { media.currentTime = time } catch { finish() }
  })
}
