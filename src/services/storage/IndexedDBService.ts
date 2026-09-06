import Dexie, { type EntityTable } from 'dexie'
import type { EditorProject, Material } from '@/types/editor'
import type { ProjectSummary, StorageQuota } from '@/types/project'

export interface StoredMaterial extends Omit<Material, 'objectUrl' | 'missing'> {
  blob: Blob
  projectId?: string
}

export interface StoredProjectRecord {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  width: number
  height: number
  fps: number
  durationFrames: number
  payload: EditorProject
}

export interface StoredThumbnail {
  projectId: string
  blob: Blob
  updatedAt: number
}

export interface StoredTrashRecord extends StoredProjectRecord {
  deletedAt: number
  materialIds: string[]
}

class ClipDatabase extends Dexie {
  materials!: EntityTable<StoredMaterial, 'id'>
  projects!: EntityTable<StoredProjectRecord, 'id'>
  thumbnails!: EntityTable<StoredThumbnail, 'projectId'>
  trash!: EntityTable<StoredTrashRecord, 'id'>

  constructor() {
    super('clip-forge')
    this.version(1).stores({ materials: 'id, type, name' })
    this.version(2).stores({
      materials: 'id, type, name, projectId',
      projects: 'id, updatedAt, name',
      thumbnails: 'projectId',
    })
    this.version(3).stores({
      materials: 'id, type, name, projectId',
      projects: 'id, updatedAt, name',
      thumbnails: 'projectId',
      trash: 'id, deletedAt, name',
    })
  }
}

export const database = new ClipDatabase()

export const materialStorage = {
  async save(material: Material, file: File, projectId: string): Promise<void> {
    const { objectUrl: _objectUrl, missing: _missing, ...record } = material
    await database.materials.put({ ...record, projectId, blob: file })
  },
  async getObjectUrl(id: string): Promise<string | undefined> {
    const record = await database.materials.get(id)
    return record ? URL.createObjectURL(record.blob) : undefined
  },
  async getBlob(id: string): Promise<Blob | undefined> {
    const record = await database.materials.get(id)
    return record?.blob
  },
  async deleteMany(ids: string[]): Promise<void> {
    if (!ids.length) return
    await database.materials.bulkDelete(ids)
  },
}

export async function readStorageQuota(): Promise<StorageQuota> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 }
  const estimate = await navigator.storage.estimate()
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
}

export function toProjectRecord(project: EditorProject): StoredProjectRecord {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    width: project.settings.width,
    height: project.settings.height,
    fps: project.settings.fps,
    durationFrames: project.settings.durationFrames,
    payload: project,
  }
}

export function toSummary(record: StoredProjectRecord, extra: Partial<ProjectSummary> = {}): Omit<ProjectSummary, 'thumbnailUrl'> {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    width: record.width,
    height: record.height,
    fps: record.fps,
    durationFrames: record.durationFrames,
    ...extra,
  }
}
