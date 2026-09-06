import type { EditorProject } from '@/types/editor'
import type { ProjectSummary, StorageQuota } from '@/types/project'
import { createEmptyProject, normalizeProject, serializeProject } from '@/services/project/factory'
import { database, materialStorage, readStorageQuota, toProjectRecord, toSummary } from '@/services/storage/IndexedDBService'

const ACTIVE_KEY = 'clip-forge-active-project'
const LEGACY_KEY = 'clip-forge-project-v1'

function readLegacy(): EditorProject | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as EditorProject
    return normalizeProject({ ...parsed, materials: parsed.materials.map((item) => ({ ...item, objectUrl: undefined })) })
  } catch {
    return null
  }
}

export const projectStorage = {
  activeId(): string | null {
    return localStorage.getItem(ACTIVE_KEY)
  },
  setActiveId(id: string): void {
    localStorage.setItem(ACTIVE_KEY, id)
  },
  async save(project: EditorProject): Promise<void> {
    await database.projects.put(toProjectRecord(serializeProject(project)))
    this.setActiveId(project.id)
  },
  async load(id: string): Promise<EditorProject> {
    const record = await database.projects.get(id)
    if (!record) throw new Error('找不到该项目')
    return normalizeProject({ ...record.payload, materials: record.payload.materials.map((item) => ({ ...item, objectUrl: undefined, missing: false })) })
  },
  async list(): Promise<Omit<ProjectSummary, 'thumbnailUrl'>[]> {
    const records = await database.projects.orderBy('updatedAt').reverse().toArray()
    return records.map((record) => toSummary(record))
  },
  async listTrash(): Promise<Omit<ProjectSummary, 'thumbnailUrl'>[]> {
    const records = await database.trash.orderBy('deletedAt').reverse().toArray()
    return records.map((record) => toSummary(record, { deletedAt: record.deletedAt }))
  },
  async saveThumbnail(projectId: string, blob: Blob): Promise<void> {
    await database.thumbnails.put({ projectId, blob, updatedAt: Date.now() })
  },
  async getThumbnail(projectId: string): Promise<Blob | undefined> {
    const record = await database.thumbnails.get(projectId)
    return record?.blob
  },
  async trashProject(id: string, materialIds: string[]): Promise<void> {
    const record = await database.projects.get(id)
    if (!record) throw new Error('找不到该项目')
    await database.transaction('rw', database.projects, database.trash, async () => {
      await database.trash.put({ ...record, deletedAt: Date.now(), materialIds })
      await database.projects.delete(id)
    })
    if (this.activeId() === id) localStorage.removeItem(ACTIVE_KEY)
  },
  async restoreProject(id: string): Promise<EditorProject> {
    const record = await database.trash.get(id)
    if (!record) throw new Error('回收站中找不到该项目')
    const { deletedAt: _deletedAt, materialIds: _materialIds, ...projectRecord } = record
    await database.transaction('rw', database.projects, database.trash, async () => {
      await database.projects.put(projectRecord)
      await database.trash.delete(id)
    })
    return normalizeProject({ ...projectRecord.payload, materials: projectRecord.payload.materials.map((item) => ({ ...item, objectUrl: undefined })) })
  },
  async purgeProject(id: string): Promise<void> {
    const record = await database.trash.get(id)
    if (!record) throw new Error('回收站中找不到该项目')
    await database.transaction('rw', database.projects, database.thumbnails, database.materials, database.trash, async () => {
      await database.trash.delete(id)
      await database.thumbnails.delete(id)
      await materialStorage.deleteMany(record.materialIds)
    })
  },
  async deleteProject(id: string, materialIds: string[]): Promise<void> {
    await this.trashProject(id, materialIds)
  },
  async quota(): Promise<StorageQuota> {
    return readStorageQuota()
  },
  async bootstrap(): Promise<EditorProject> {
    const existing = await database.projects.toArray()
    if (existing.length === 0) {
      const project = readLegacy() ?? createEmptyProject()
      await this.save(project)
      localStorage.removeItem(LEGACY_KEY)
      return project
    }
    const activeId = this.activeId()
    const sorted = [...existing].sort((left, right) => right.updatedAt - left.updatedAt)
    const record = (activeId ? existing.find((item) => item.id === activeId) : undefined) ?? sorted[0]
    this.setActiveId(record.id)
    return normalizeProject({ ...record.payload, materials: record.payload.materials.map((item) => ({ ...item, objectUrl: undefined })) })
  },
}
