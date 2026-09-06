export interface ProjectSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  width: number
  height: number
  fps: number
  durationFrames: number
  thumbnailUrl?: string
  deletedAt?: number
}

export interface StorageQuota {
  usage: number
  quota: number
}
