import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { createEmptyProject } from '@/services/project/factory'
import { DEFAULT_TRANSFORM } from '@/types/editor'
import { buildDraftPackage, zipDraftPackage } from '@/services/jianying/JianYingExporter'
import { JIANYING_PATH_TOKEN } from '@/services/jianying/JianYingTemplate'
import { planJianYingResources } from '@/services/jianying/resources'

describe('jianying package', () => {
  it('writes 5.9 sidecar files, bundled media and the fixed path token', async () => {
    const project = createEmptyProject('导出草稿')
    project.materials.push({ id: 'mat-v', type: 'video', name: 'clip.mp4', mimeType: 'video/mp4', size: 4 })
    project.clips.push({
      id: 'v-1',
      trackId: 'visual-1',
      type: 'video',
      materialId: 'mat-v',
      startFrame: 0,
      durationFrames: 30,
      offsetFrame: 0,
      name: 'clip',
      zIndex: 0,
      locked: false,
      transform: { ...DEFAULT_TRANSFORM },
    })
    const packed = planJianYingResources(project, 'ignored-id').map((item) => ({ ...item, blob: new Blob(['mp4'], { type: 'video/mp4' }) }))
    const pkg = buildDraftPackage(project, packed, 'DRAFT-ID')
    expect(pkg.files.map((file) => file.path)).toEqual(expect.arrayContaining([
      'draft_content.json',
      'draft_info.json',
      'draft_meta_info.json',
      'attachment_pc_common.json',
      'draft_settings',
      'draft_cover.jpg',
      'Resources/local/video/clip.mp4',
    ]))
    const content = JSON.parse(String(pkg.files.find((file) => file.path === 'draft_content.json')?.data)) as { source: string; materials: { videos: Array<{ path: string }> } }
    expect(content.source).toBe('default')
    expect(content.materials.videos[0].path).toBe(`${JIANYING_PATH_TOKEN}/Resources/local/video/clip.mp4`)
    const zip = await JSZip.loadAsync(await (await zipDraftPackage(pkg)).arrayBuffer())
    expect(zip.file('导出草稿/draft_content.json')).toBeTruthy()
    expect(zip.file('导出草稿/Resources/local/video/clip.mp4')).toBeTruthy()
    expect(await zip.file('导出草稿/Resources/local/video/clip.mp4')?.async('string')).toBe('mp4')
  })
})
