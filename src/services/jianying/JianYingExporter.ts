import JSZip from 'jszip'
import type { EditorProject } from '@/types/editor'
import { mapProjectToDraft } from '@/services/jianying/JianYingMapper'
import { materialStorage } from '@/services/storage/IndexedDBService'
import { abortError } from '@/services/task/TaskProgress'
import type { ExportHandlers } from '@/services/export/VideoExporter'

export interface DraftExporter {
  export(project: EditorProject, handlers?: ExportHandlers): Promise<Blob>
}

function extensionOf(name: string, type: string): string {
  if (name.includes('.')) return name.slice(name.lastIndexOf('.'))
  if (type === 'image') return '.png'
  if (type === 'audio') return '.mp3'
  return '.mp4'
}

export class JianYingExporter implements DraftExporter {
  async export(project: EditorProject, handlers: ExportHandlers = {}): Promise<Blob> {
    const signal = handlers.signal ?? new AbortController().signal
    const { content, meta } = mapProjectToDraft(project)
    const zip = new JSZip()
    zip.file('draft_content.json', JSON.stringify(content, null, 2))
    zip.file('draft_meta_info.json', JSON.stringify(meta, null, 2))
    const resources = zip.folder('Resources')
    if (!resources) throw new Error('无法创建 Resources 目录')
    const materials = project.materials
    for (const [index, material] of materials.entries()) {
      if (signal.aborted) throw abortError()
      const blob = await materialStorage.getBlob(material.id)
      if (!blob) continue
      resources.file(`${material.id}${extensionOf(material.name, material.type)}`, blob)
      handlers.onProgress?.({
        currentFrame: index + 1,
        totalFrames: Math.max(1, materials.length),
        percent: Math.round(((index + 1) / Math.max(1, materials.length)) * 100),
        elapsedMs: 0,
        remainingMs: null,
        message: `正在打包素材 ${material.name}`,
      })
    }
    return zip.generateAsync({ type: 'blob' })
  }
}
