import { describe, expect, it } from 'vitest'
import { buildRootMetaEntry, joinOsPath, mergeRootMetaIndex, parseRootMetaIndex, resolveDraftOsPath } from '@/services/jianying/rootMeta'

describe('jianying root meta index', () => {
  it('infers the OS draft path from an existing store entry', () => {
    const index = {
      all_draft_store: [{
        draft_fold_path: 'C:\\Users\\me\\AppData\\Local\\JianyingPro\\User Data\\Projects\\com.lveditor.draft\\旧草稿',
        draft_root_path: 'C:\\Users\\me\\AppData\\Local\\JianyingPro\\User Data\\Projects\\com.lveditor.draft',
      }],
    }
    const paths = resolveDraftOsPath(index, '新草稿')
    expect(paths.foldPath).toBe('C:\\Users\\me\\AppData\\Local\\JianyingPro\\User Data\\Projects\\com.lveditor.draft\\新草稿')
    expect(joinOsPath(paths.foldPath, 'draft_content.json')).toContain('新草稿\\draft_content.json')
  })

  it('clones an existing entry shape and keeps other drafts', () => {
    const existing = {
      all_draft_store: [{
        draft_id: 'OLD',
        draft_name: '旧草稿',
        draft_fold_path: 'D:/drafts/旧草稿',
        extra_field: 42,
      }],
    }
    const entry = buildRootMetaEntry({
      draftId: 'NEW',
      draftName: '新草稿',
      foldPath: 'D:/drafts/新草稿',
      rootPath: 'D:/drafts',
      durationUs: 1_000_000,
      nowMs: 1_700_000_000_000,
    })
    const merged = mergeRootMetaIndex(existing, entry, 'D:/drafts/新草稿')
    const store = merged.all_draft_store as Array<Record<string, unknown>>
    expect(store).toHaveLength(2)
    expect(store[0].draft_name).toBe('旧草稿')
    expect(store[1].draft_id).toBe('NEW')
    expect(store[1].extra_field).toBe(42)
    expect(store[1].draft_is_invisible).toBe(false)
    expect(store[1].tm_draft_create).toBe(1_700_000_000_000_000)
  })

  it('rejects encrypted or invalid index text', () => {
    expect(parseRootMetaIndex('not-json')).toBeNull()
    expect(parseRootMetaIndex('{"all_draft_store":[]}')).toEqual({ all_draft_store: [] })
  })
})
