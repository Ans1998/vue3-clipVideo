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
    expect(resource.sourceId).toBe('mat-v')
    expect(resource.materialId).toBe('mat-v')
    expect(resource.relativePath).toBe('Resources/local/video/shot.mp4')
    expect(resource.draftPath).toBe(`${draftPathPlaceholder(draftId)}/Resources/local/video/shot.mp4`)
    expect(resource.metaPath).toBe('./Resources/local/video/shot.mp4')
    expect(resource.metetype).toBe('video')
  })

  it('packs split-from-video audio into the audio folder under an alias id', () => {
    const project = createEmptyProject()
    project.materials.push({ id: 'mat-v', type: 'video', name: 'shot.mp4', mimeType: 'video/mp4', size: 1 })
    project.clips.push(
      {
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
      },
      {
        id: 'c2',
        trackId: 'audio-1',
        type: 'audio',
        materialId: 'mat-v',
        startFrame: 0,
        durationFrames: 30,
        offsetFrame: 0,
        name: 'shot audio',
        zIndex: 1,
        locked: false,
        transform: { ...DEFAULT_TRANSFORM },
      },
    )
    const resources = planJianYingResources(project, 'AAAA-BBBB')
    expect(resources.map((item) => item.kind).sort()).toEqual(['audio', 'video'])
    const audio = resources.find((item) => item.kind === 'audio')
    expect(audio?.materialId).toBe('audio-mat-v')
    expect(audio?.sourceId).toBe('mat-v')
    expect(audio?.relativePath.startsWith('Resources/local/audio/')).toBe(true)
  })
})
