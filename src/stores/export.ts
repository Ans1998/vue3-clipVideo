import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ExportManager } from '@/services/export/ExportManager'
import { FFmpegExporter } from '@/services/export/FFmpegExporter'
import { detectExportCapabilities } from '@/services/export/VideoExporter'
import { WebCodecsExporter } from '@/services/export/WebCodecsExporter'
import { WebVideoExporter } from '@/services/export/WebVideoExporter'
import { canPickJianYingDirectory, pickJianYingDraftRoot } from '@/services/jianying/directory'
import { JianYingExporter } from '@/services/jianying/JianYingExporter'
import { isAbortError, TaskRunner, type TaskSnapshot } from '@/services/task/TaskProgress'
import { cloneProject } from '@/services/project/factory'
import { useEditorStore } from '@/stores/editor'
import type { ExportOptions, ExportResult } from '@/types/export'
import { sanitizeFileName } from '@/utils/format'

export const useExportStore = defineStore('export', () => {
  const editor = useEditorStore()
  const capabilities = detectExportCapabilities()
  const manager = new ExportManager([new WebCodecsExporter(), new WebVideoExporter(), new FFmpegExporter()])
  const jianying = new JianYingExporter()
  const jianyingRunner = new TaskRunner()
  const dialogOpen = ref(false)
  const jianyingOpen = ref(false)
  const view = ref<'settings' | 'progress' | 'result'>('settings')
  const progress = ref<TaskSnapshot | null>(null)
  const result = ref<ExportResult | null>(null)
  const error = ref('')
  const busy = computed(() => progress.value?.status === 'running' || progress.value?.status === 'cancelling')

  function open(): void {
    dialogOpen.value = true
    view.value = 'settings'
    result.value = null
    error.value = ''
  }

  function openJianYing(): void {
    jianyingOpen.value = true
    view.value = 'settings'
    result.value = null
    error.value = ''
  }

  function close(): void {
    if (busy.value) return
    dialogOpen.value = false
    jianyingOpen.value = false
    result.value = null
    error.value = ''
  }

  async function start(options: ExportOptions): Promise<void> {
    view.value = 'progress'
    error.value = ''
    result.value = null
    try {
      const exported = await manager.run(cloneProject(editor.project), options, (snapshot) => { progress.value = { ...snapshot } })
      result.value = exported
      view.value = 'result'
    } catch (reason) {
      if (isAbortError(reason)) { view.value = 'settings'; progress.value = null; return }
      error.value = reason instanceof Error ? reason.message : '导出失败'
      view.value = 'settings'
    }
  }

  async function startJianYing(mode: 'zip' | 'directory' = 'zip'): Promise<void> {
    error.value = ''
    result.value = null
    let directory: FileSystemDirectoryHandle | undefined
    if (mode === 'directory') {
      try {
        directory = await pickJianYingDraftRoot()
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        error.value = reason instanceof Error ? reason.message : '无法打开剪映草稿目录'
        return
      }
    }
    view.value = 'progress'
    try {
      let warnings: string[] = []
      let savedToDirectory = false
      let folderName = sanitizeFileName(editor.project.name)
      const blob = await jianyingRunner.run(editor.project.name, Math.max(1, editor.project.materials.length), async (ctx) => {
        const exported = await jianying.export(cloneProject(editor.project), {
          signal: ctx.signal,
          directory,
          onProgress: (item) => ctx.report({ current: item.currentFrame, total: item.totalFrames, message: item.message }),
        })
        warnings = exported.warnings
        savedToDirectory = exported.savedToDirectory
        folderName = exported.folderName
        return exported.blob
      })
      progress.value = { ...jianyingRunner.snapshot }
      result.value = {
        blob,
        fileName: savedToDirectory ? folderName : `${folderName}.zip`,
        mimeType: savedToDirectory ? 'text/plain' : 'application/zip',
        durationFrames: editor.project.settings.durationFrames,
        width: editor.project.settings.width,
        height: editor.project.settings.height,
        fps: editor.project.settings.fps,
        format: 'webm',
        exporterId: 'jianying',
        warnings,
        savedToDirectory,
      }
      view.value = 'result'
    } catch (reason) {
      if (isAbortError(reason)) { view.value = 'settings'; progress.value = null; return }
      error.value = reason instanceof Error ? reason.message : '剪映草稿导出失败'
      view.value = 'settings'
    }
  }

  function cancel(): void {
    manager.cancel()
    jianyingRunner.cancel()
  }

  function retry(): void {
    result.value = null
    view.value = 'settings'
  }

  function download(): void {
    if (!result.value) return
    const url = URL.createObjectURL(result.value.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = result.value.fileName
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function defaultFileName(): string {
    return sanitizeFileName(editor.project.name)
  }

  return { capabilities, canPickJianYingDirectory, dialogOpen, jianyingOpen, view, progress, result, error, busy, open, openJianYing, close, start, startJianYing, cancel, retry, download, defaultFileName }
})
