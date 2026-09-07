export function parentOsPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return path
  const parent = normalized.slice(0, index)
  return path.includes('\\') ? parent.replace(/\//g, '\\') : parent
}

export function joinOsPath(parent: string, name: string): string {
  if (!parent) return name
  const sep = parent.includes('\\') ? '\\' : '/'
  return `${parent.replace(/[\\/]+$/, '')}${sep}${name}`
}

export function findDraftStoreKey(index: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(index)) {
    if (Array.isArray(value) && value.some((entry) => entry && typeof entry === 'object' && ('draft_fold_path' in entry || 'draft_id' in entry))) {
      return key
    }
  }
  for (const [key, value] of Object.entries(index)) {
    if (Array.isArray(value) && /all_draft_store|draft_store/i.test(key)) return key
  }
  return null
}

export function parseRootMetaIndex(text: string): Record<string, unknown> | null {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

export function resolveDraftOsPath(index: Record<string, unknown> | null, folderName: string): { foldPath: string; rootPath: string } {
  const storeKey = index ? findDraftStoreKey(index) : null
  const store = storeKey && index && Array.isArray(index[storeKey]) ? index[storeKey] as Array<Record<string, unknown>> : []
  const sample = store.find((entry) => typeof entry.draft_fold_path === 'string' && entry.draft_fold_path)
  if (sample && typeof sample.draft_fold_path === 'string') {
    const rootPath = typeof sample.draft_root_path === 'string' && sample.draft_root_path
      ? sample.draft_root_path
      : parentOsPath(sample.draft_fold_path)
    return { foldPath: joinOsPath(parentOsPath(sample.draft_fold_path), folderName), rootPath }
  }
  const rootPath = typeof index?.root_path === 'string' ? index.root_path : ''
  if (rootPath) return { foldPath: joinOsPath(rootPath, folderName), rootPath }
  return { foldPath: folderName, rootPath: '' }
}

export function buildRootMetaEntry(opts: {
  draftId: string
  draftName: string
  foldPath: string
  rootPath: string
  durationUs: number
  nowMs?: number
}): Record<string, unknown> {
  const nowMs = opts.nowMs ?? Date.now()
  const tm = nowMs * 1000
  return {
    draft_cover: 'draft_cover.jpg',
    draft_fold_path: opts.foldPath,
    draft_id: opts.draftId,
    draft_is_ai_shorts: false,
    draft_is_invisible: false,
    draft_json_file: joinOsPath(opts.foldPath, 'draft_content.json'),
    draft_name: opts.draftName,
    draft_new_version: '',
    draft_root_path: opts.rootPath,
    draft_timeline_materials_size: 0,
    tm_draft_create: tm,
    tm_draft_modified: tm,
    tm_draft_removed: 0,
    tm_duration: opts.durationUs,
  }
}

export function mergeRootMetaIndex(
  existing: Record<string, unknown> | null,
  entry: Record<string, unknown>,
  foldPath: string,
): Record<string, unknown> {
  const index = existing ? structuredClone(existing) : { all_draft_store: [] as Record<string, unknown>[], draft_ids: 0, root_path: entry.draft_root_path ?? '' }
  const storeKey = findDraftStoreKey(index) ?? 'all_draft_store'
  const store = Array.isArray(index[storeKey]) ? [...index[storeKey] as Array<Record<string, unknown>>] : []
  const filtered = store.filter((item) => item.draft_fold_path !== foldPath && item.draft_id !== entry.draft_id)
  const template = filtered[0]
  filtered.push(template ? { ...template, ...entry } : entry)
  index[storeKey] = filtered
  index.draft_ids = filtered.length
  if (!index.root_path && entry.draft_root_path) index.root_path = entry.draft_root_path
  return index
}
