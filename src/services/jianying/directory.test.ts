import { describe, expect, it } from 'vitest'
import { uniqueDraftFolderName } from '@/services/jianying/directory'

describe('jianying directory names', () => {
  it('keeps the project name when the draft folder is free', () => {
    expect(uniqueDraftFolderName(['other'], '样本项目')).toBe('样本项目')
  })

  it('adds a numeric suffix when the folder already exists', () => {
    expect(uniqueDraftFolderName(['样本项目', '样本项目_2'], '样本项目')).toBe('样本项目_3')
  })
})
