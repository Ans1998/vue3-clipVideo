import type { EditorProject, Material, MaterialType } from '@/types/editor'
import { materialStorage } from '@/services/storage/IndexedDBService'
import { draftPathPlaceholder, framesToUs, JIANYING_PHOTO_DURATION_US } from '@/services/jianying/JianYingTemplate'
import { sanitizeFileName } from '@/utils/format'

export type JianYingResourceKind = 'video' | 'image' | 'audio'
export type JianYingMetaType = 'video' | 'photo' | 'music'

export interface JianYingPackedResource {
  materialId: string
  kind: JianYingResourceKind
  metetype: JianYingMetaType
  fileName: string
  relativePath: string
  draftPath: string
  metaPath: string
  extraInfo: string
  durationUs: number
  width: number
  height: number
}

export function resourceKind(type: MaterialType): JianYingResourceKind {
  if (type === 'image') return 'image'
  if (type === 'audio') return 'audio'
  return 'video'
}

export function metaTypeOf(type: MaterialType): JianYingMetaType {
  if (type === 'image') return 'photo'
  if (type === 'audio') return 'music'
  return 'video'
}

export function materialExtension(name: string, type: MaterialType): string {
  const match = name.match(/\.[a-z0-9]{2,5}$/i)
  if (match) return match[0].toLowerCase()
  if (type === 'image') return '.png'
  if (type === 'audio') return '.mp3'
  return '.mp4'
}

function uniqueFileName(material: Material, used: Set<string>): string {
  const ext = materialExtension(material.name, material.type)
  const stem = sanitizeFileName(material.name.replace(/\.[^.]+$/, '')) || material.id
  let fileName = `${stem}${ext}`
  let index = 1
  while (used.has(fileName.toLowerCase())) {
    fileName = `${stem}_${index}${ext}`
    index += 1
  }
  used.add(fileName.toLowerCase())
  return fileName
}

export function usedMaterialIds(project: EditorProject): Set<string> {
  return new Set(project.clips.map((clip) => clip.materialId).filter((id): id is string => Boolean(id)))
}

export function planJianYingResources(project: EditorProject, draftId: string): JianYingPackedResource[] {
  const placeholder = draftPathPlaceholder(draftId)
  const usedNames = new Set<string>()
  const needed = usedMaterialIds(project)
  return project.materials.filter((material) => needed.has(material.id)).map((material) => {
    const kind = resourceKind(material.type)
    const fileName = uniqueFileName(material, usedNames)
    const relativePath = `Resources/local/${kind}/${fileName}`
    return {
      materialId: material.id,
      kind,
      metetype: metaTypeOf(material.type),
      fileName,
      relativePath,
      draftPath: `${placeholder}/${relativePath}`,
      metaPath: `./${relativePath}`,
      extraInfo: fileName,
      durationUs: material.type === 'image' ? JIANYING_PHOTO_DURATION_US : framesToUs(material.durationFrames ?? project.settings.fps, project.settings.fps),
      width: material.width ?? project.settings.width,
      height: material.height ?? project.settings.height,
    }
  })
}

export async function loadMaterialBlob(material: Material): Promise<Blob | null> {
  const stored = await materialStorage.getBlob(material.id)
  if (stored && stored.size > 0) return stored
  if (!material.objectUrl) return null
  try {
    const response = await fetch(material.objectUrl)
    if (!response.ok) return null
    const blob = await response.blob()
    return blob.size > 0 ? blob : null
  } catch {
    return null
  }
}

export function jianYingReadme(draftName: string): string {
  return [
    `CLIPFORGE 剪映草稿：${draftName}`,
    '',
    '打开方式（避免「媒体缺失」）：',
    '1. 解压这个 ZIP，得到与草稿同名的文件夹。',
    '2. 把整个文件夹复制到剪映草稿目录，不要只拷 JSON。',
    '3. 必须把整个文件夹放到剪映草稿目录里，不要留在下载文件夹。剪映是沙盒应用，读不到桌面/下载里的素材，所以会显示媒体缺失。',
    '4. 完全退出剪映后再打开，草稿列表才会刷新。',
    '',
    'Windows 草稿目录：',
    '%LOCALAPPDATA%\\JianyingPro\\User Data\\Projects\\com.lveditor.draft\\',
    '',
    'macOS 草稿目录：',
    '~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft/',
    '',
    '文件夹内必须同时包含：',
    '- draft_content.json、draft_info.json、draft_meta_info.json',
    '- Resources/local/video、image、audio 下的素材文件',
    '',
    '推荐：导出时用「写入剪映草稿目录」，在弹出的选择器里选上面这个 com.lveditor.draft 文件夹。',
  ].join('\n')
}
