import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '@/services/project/factory'
import { DEFAULT_TRANSFORM } from '@/types/editor'
import { draftPathPlaceholder } from '@/services/jianying/JianYingTemplate'
import { planJianYingResources } from '@/services/jianying/resources'

describe('jianying resources', () => {
  it('plans portable draft-relative media paths', () => {
    const project = createEmptyProject()
    project.materials.push({ id: 'mat-v', type: 'video', name: 'shot.mp4', mimeType: 'video/mp4', size: 1 })
    project.clips.push({
      id: 'c1',
      trackId: 'visual-1',
      type: 'video',
      materialId: 'mat-v',
      startFrame: 0,
      durationFrames: 30,
      offsetFrame: 0,
      name: 'shot',
      zIndex: 0,
      locked: false,
      transform: { ...DEFAULT_TRANSFORM },
    })
    const draftId = 'AAAA-BBBB'
    const [resource] = planJianYingResources(project, draftId)
    expect(resource.relativePath).toBe('Resources/local/video/shot.mp4')
    expect(resource.draftPath).toBe(`${draftPathPlaceholder(draftId)}/Resources/local/video/shot.mp4`)
    expect(resource.metaPath).toBe('./Resources/local/video/shot.mp4')
    expect(resource.metetype).toBe('video')
  })
})
