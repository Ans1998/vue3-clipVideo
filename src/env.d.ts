/// <reference types="vite/client" />

interface CanvasCaptureMediaStreamTrack extends MediaStreamTrack {
  requestFrame(): void
}
