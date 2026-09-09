import JSZip from 'jszip'
import type { EditorProject } from '@/types/editor'
import { mapProjectToDraft } from '@/services/jianying/JianYingMapper'
import { abortError } from '@/services/task/TaskProgress'
import type { ExportHandlers } from '@/services/export/VideoExporter'
import { ensureDirectory, listDirectoryNames, readTextFile, uniqueDraftFolderName, writeRelativeFile } from '@/services/jianying/directory'
import { JIANYING_EMPTY_DIRS } from '@/services/jianying/JianYingTemplate'
import { jianYingReadme, loadMaterialBlob, planJianYingResources, usedMaterialIds, type JianYingPackedResource } from '@/services/jianying/resources'
import { buildRootMetaEntry, mergeRootMetaIndex, parseRootMetaIndex, resolveDraftOsPath } from '@/services/jianying/rootMeta'
import { sanitizeFileName } from '@/utils/format'

export interface JianYingExportHandlers extends ExportHandlers {
  directory?: FileSystemDirectoryHandle
}

export interface JianYingPackedFile extends JianYingPackedResource {
  blob: Blob
}

export interface JianYingDraftFile {
  path: string
  data: Blob | string
}

export interface JianYingDraftPackage {
  folderName: string
  files: JianYingDraftFile[]
  emptyDirs: string[]
  warnings: string[]
  draftId: string
  durationUs: number
}

export interface JianYingExportResult {
  blob: Blob
  warnings: string[]
  savedToDirectory: boolean
  folderName: string
}

export interface DraftExporter {
  export(project: EditorProject, handlers?: JianYingExportHandlers): Promise<JianYingExportResult>
}

function createDraftId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}`).toUpperCase()
}

function attachmentPcCommon(): Record<string, unknown> {
  return {
    ai_packaging_infos: [],
    ai_packaging_report_info: { caption_id_list: [], task_id: '', text_style: '', tos_id: '', video_category: '' },
    commercial_music_category_ids: [],
    pc_feature_flag: 0,
    recognize_tasks: [],
    template_item_infos: [],
    unlock_template_ids: [],
  }
}

function draftSettings(nowSec: number, durationSec: number): string {
  return [
    '[General]',
    'cloud_last_modify_platform=windows',
    `draft_create_time=${nowSec}`,
    `draft_last_edit_time=${nowSec}`,
    'real_edit_keys=1',
    `real_edit_seconds=${Math.max(1, Math.round(durationSec))}`,
    '',
  ].join('\n')
}

function tinyJpeg(): Blob {
  const bytes = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAD//2Q=='), (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: 'image/jpeg' })
}

export function buildDraftPackage(project: EditorProject, packed: JianYingPackedFile[], draftId: string): JianYingDraftPackage {
  const { content, meta } = mapProjectToDraft(project, packed, draftId)
  const json = JSON.stringify(content, null, 2)
  const durationUs = Number(content.duration) || 0
  const files: JianYingDraftFile[] = [
    { path: 'draft_content.json', data: json },
    { path: 'draft_info.json', data: json },
    { path: 'draft_meta_info.json', data: JSON.stringify(meta, null, 2) },
    { path: 'attachment_pc_common.json', data: JSON.stringify(attachmentPcCommon(), null, 2) },
    { path: 'draft_settings', data: draftSettings(Math.floor(Date.now() / 1000), durationUs / 1_000_000) },
    { path: 'draft_cover.jpg', data: tinyJpeg() },
    { path: 'README.txt', data: jianYingReadme(project.name) },
    ...packed.map((item) => ({ path: item.relativePath, data: item.blob })),
  ]
  return {
    folderName: sanitizeFileName(project.name) || 'draft',
    files,
    emptyDirs: [...JIANYING_EMPTY_DIRS],
    draftId,
    durationUs,
    warnings: [
      `已打包 ${packed.length} 个素材到 Resources/local/。`,
      '必须把整个草稿文件夹放到剪映目录 com.lveditor.draft 里，并用「写入剪映草稿目录」登记到 root_meta_info.json。只拷文件夹或只解压 ZIP，剪映扫描不到。',
    ],
  }
}

export async function zipDraftPackage(pkg: JianYingDraftPackage): Promise<Blob> {
  const zip = new JSZip()
  const root = zip.folder(pkg.folderName)
  if (!root) throw new Error('无法创建草稿目录')
  for (const dir of pkg.emptyDirs) root.folder(dir)
  for (const file of pkg.files) {
    const data = typeof file.data === 'string' ? file.data : await file.data.arrayBuffer()
    root.file(file.path, data)
  }
  return new Blob([await zip.generateAsync({ type: 'arraybuffer' })], { type: 'application/zip' })
}

export async function writeDraftPackage(root: FileSystemDirectoryHandle, pkg: JianYingDraftPackage, opts: { draftId: string; draftName: string; durationUs: number }): Promise<{ folderName: string; registered: boolean; warning?: string }> {
  const folderName = uniqueDraftFolderName(await listDirectoryNames(root), pkg.folderName)
  const draft = await root.getDirectoryHandle(folderName, { create: true })
  for (const dir of pkg.emptyDirs) await ensureDirectory(draft, dir)
  for (const file of pkg.files) {
    if (file.path === 'README.txt') continue
    await writeRelativeFile(draft, file.path, file.data)
  }
  const registration = await registerInRootMeta(root, folderName, opts)
  if (registration.foldPath) {
    const metaFile = pkg.files.find((file) => file.path === 'draft_meta_info.json')
    if (metaFile && typeof metaFile.data === 'string') {
      const meta = JSON.parse(metaFile.data) as Record<string, unknown>
      meta.draft_fold_path = registration.foldPath
      meta.draft_root_path = registration.rootPath
      await writeRelativeFile(draft, 'draft_meta_info.json', JSON.stringify(meta, null, 2))
    }
  }
  return { folderName, registered: registration.registered, warning: registration.warning }
}

async function registerInRootMeta(
  draftsRoot: FileSystemDirectoryHandle,
  folderName: string,
  opts: { draftId: string; draftName: string; durationUs: number },
): Promise<{ registered: boolean; foldPath: string; rootPath: string; warning?: string }> {
  const raw = await readTextFile(draftsRoot, 'root_meta_info.json')
  if (raw && parseRootMetaIndex(raw) == null) {
    return {
      registered: false,
      foldPath: folderName,
      rootPath: '',
      warning: '已写入草稿文件夹，但 root_meta_info.json 无法解析（可能已加密）。未改索引，以免弄丢现有草稿。请完全退出剪映后再打开，或在剪映里点「扫描草稿」。',
    }
  }
  const existing = parseRootMetaIndex(raw ?? '') ?? { all_draft_store: [] as Record<string, unknown>[], draft_ids: 0, root_path: '' }
  const paths = resolveDraftOsPath(existing, folderName)
  const entry = buildRootMetaEntry({
    draftId: opts.draftId,
    draftName: opts.draftName,
    foldPath: paths.foldPath,
    rootPath: paths.rootPath,
    durationUs: opts.durationUs,
  })
  const next = mergeRootMetaIndex(existing, entry, paths.foldPath)
  if (raw) await writeRelativeFile(draftsRoot, 'root_meta_info.json.bak', raw)
  await writeRelativeFile(draftsRoot, 'root_meta_info.json', JSON.stringify(next, null, 2))
  return {
    registered: true,
    foldPath: paths.foldPath,
    rootPath: paths.rootPath,
    warning: paths.rootPath ? undefined : '已登记到 root_meta_info.json。当前目录里没有旧草稿可供推断绝对路径，若列表仍不显示，请确认选中的是 com.lveditor.draft 本身。',
  }
}

export class JianYingExporter implements DraftExporter {
  async export(project: EditorProject, handlers: JianYingExportHandlers = {}): Promise<JianYingExportResult> {
    const signal = handlers.signal ?? new AbortController().signal
    const draftId = createDraftId()
    const planned = planJianYingResources(project, draftId)
    const missingNames: string[] = []
    const packed: JianYingPackedFile[] = []
    for (const [index, item] of planned.entries()) {
      if (signal.aborted) throw abortError()
      const material = project.materials.find((entry) => entry.id === item.sourceId || entry.id === item.materialId)
      const blob = material ? await loadMaterialBlob(material) : null
      if (!blob) {
        missingNames.push(material?.name ?? item.fileName)
        continue
      }
      packed.push({ ...item, blob })
      handlers.onProgress?.({
        currentFrame: index + 1,
        totalFrames: Math.max(1, planned.length),
        percent: Math.round(((index + 1) / Math.max(1, planned.length)) * 100),
        elapsedMs: 0,
        remainingMs: null,
        message: `正在打包素材 ${material?.name ?? item.fileName}`,
      })
    }
    if (missingNames.length) {
      throw new Error(`以下素材无法写入草稿，剪映会显示媒体缺失：${missingNames.join('、')}。请先在素材列表点「关联」重新选择文件。`)
    }
    const packedIds = new Set(packed.map((item) => item.sourceId))
    const leftover = [...usedMaterialIds(project)].filter((id) => !packedIds.has(id))
    if (leftover.length) throw new Error('时间轴引用了未打包的素材，请重新关联后再导出剪映草稿')

    const pkg = buildDraftPackage(project, packed, draftId)
    if (handlers.directory) {
      const written = await writeDraftPackage(handlers.directory, pkg, {
        draftId: pkg.draftId,
        draftName: project.name,
        durationUs: pkg.durationUs,
      })
      handlers.onProgress?.({
        currentFrame: Math.max(1, packed.length),
        totalFrames: Math.max(1, packed.length),
        percent: 100,
        elapsedMs: 0,
        remainingMs: null,
        message: '正在写入剪映草稿目录',
      })
      return {
        blob: new Blob(),
        folderName: written.folderName,
        savedToDirectory: true,
        warnings: [
          written.registered
            ? `已写入 ${written.folderName}，并登记到 root_meta_info.json。`
            : `已写入 ${written.folderName}，但未能登记到草稿索引。`,
          written.warning ?? '请完全退出剪映后再打开。剪映不会扫描文件夹，只认这个索引。',
          '必须选择 com.lveditor.draft 这一层目录，不要选里面的某个草稿文件夹。',
        ].filter(Boolean),
      }
    }

    handlers.onProgress?.({
      currentFrame: Math.max(1, packed.length),
      totalFrames: Math.max(1, packed.length),
      percent: 100,
      elapsedMs: 0,
      remainingMs: null,
      message: '正在生成 ZIP',
    })
    return {
      blob: await zipDraftPackage(pkg),
      folderName: pkg.folderName,
      savedToDirectory: false,
      warnings: pkg.warnings,
    }
  }
}
