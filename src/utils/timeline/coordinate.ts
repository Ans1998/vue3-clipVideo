export const frameToPixel = (frame: number, pixelsPerFrame: number) => frame * pixelsPerFrame
export const pixelToFrame = (pixel: number, pixelsPerFrame: number) => Math.max(0, Math.round(pixel / pixelsPerFrame))
