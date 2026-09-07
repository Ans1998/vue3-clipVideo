import { sanitizeFileName } from '@/utils/format'

interface DirectoryPicker {
  showDirectoryPicker: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
}

type DirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
}

function directoryPicker(): DirectoryPicker | undefined {
  const host = globalThis as typeof globalThis & Partial<DirectoryPicker>
  if (typeof host.showDirectoryPicker !== 'function') return undefined
  return host as DirectoryPicker
}

export function canPickJianYingDirectory(): boolean {
  return Boolean(directoryPicker())
}

export function uniqueDraftFolderName(existing: Iterable<string>, desired: string): string {
  const used = new Set([...existing].map((name) => name.toLowerCase()))
  const base = sanitizeFileName(desired) || 'draft'
  if (!used.has(base.toLowerCase())) return base
  let index = 2
  while (used.has(`${base}_${index}`.toLowerCase())) index += 1
  return `${base}_${index}`
}

export async function pickJianYingDraftRoot(): Promise<FileSystemDirectoryHandle> {
  const picker = directoryPicker()
  if (!picker) {
    throw new Error('当前浏览器不支持直接写入文件夹。请使用 Chrome 或 Edge，或下载 ZIP 后手动复制到剪映草稿目录。')
  }
  return picker.showDirectoryPicker({ id: 'jianying-draft-root', mode: 'readwrite' })
}

export async function listDirectoryNames(root: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = []
  for await (const [name] of (root as DirectoryHandleWithEntries).entries()) names.push(name)
  return names
}

export async function ensureDirectory(root: FileSystemDirectoryHandle, relative: string): Promise<FileSystemDirectoryHandle> {
  let dir = root
  for (const part of relative.split('/').filter(Boolean)) {
    dir = await dir.getDirectoryHandle(part, { create: true })
  }
  return dir
}

export async function writeRelativeFile(root: FileSystemDirectoryHandle, relative: string, data: Blob | string): Promise<void> {
  const parts = relative.split('/').filter(Boolean)
  const fileName = parts.pop()
  if (!fileName) return
  const dir = await ensureDirectory(root, parts.join('/'))
  const file = await dir.getFileHandle(fileName, { create: true })
  const writable = await file.createWritable()
  await writable.write(data)
  await writable.close()
}

export async function readTextFile(root: FileSystemDirectoryHandle, relative: string): Promise<string | null> {
  try {
    const parts = relative.split('/').filter(Boolean)
    const fileName = parts.pop()
    if (!fileName) return null
    let dir = root
    for (const part of parts) dir = await dir.getDirectoryHandle(part)
    const file = await dir.getFileHandle(fileName)
    return (await file.getFile()).text()
  } catch {
    return null
  }
}
