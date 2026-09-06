import { nanoid } from 'nanoid'

export type TaskStatus = 'idle' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled'

export interface TaskSnapshot {
  id: string
  name: string
  status: TaskStatus
  current: number
  total: number
  percent: number
  elapsedMs: number
  remainingMs: number | null
  message: string
  error?: string
}

export interface TaskContext {
  signal: AbortSignal
  report(update: Partial<Pick<TaskSnapshot, 'current' | 'total' | 'message'>>): void
  throwIfCancelled(): void
}

export function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

export function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError'
}

export function idleTaskSnapshot(): TaskSnapshot {
  return {
    id: '',
    name: '',
    status: 'idle',
    current: 0,
    total: 0,
    percent: 0,
    elapsedMs: 0,
    remainingMs: null,
    message: '',
  }
}

export class TaskRunner {
  private abort: AbortController | null = null
  private startedAt = 0
  private readonly listeners = new Set<(snapshot: TaskSnapshot) => void>()
  snapshot: TaskSnapshot = idleTaskSnapshot()

  subscribe(listener: (snapshot: TaskSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => { this.listeners.delete(listener) }
  }

  cancel(): void {
    if (this.snapshot.status !== 'running') return
    this.abort?.abort()
    this.patch({ status: 'cancelling', message: '正在取消...' })
  }

  async run<T>(name: string, total: number, work: (ctx: TaskContext) => Promise<T>): Promise<T> {
    if (this.snapshot.status === 'running' || this.snapshot.status === 'cancelling') throw new Error('已有任务正在进行')
    this.abort = new AbortController()
    this.startedAt = performance.now()
    this.patch({
      id: nanoid(),
      name,
      status: 'running',
      current: 0,
      total,
      percent: 0,
      elapsedMs: 0,
      remainingMs: null,
      message: '正在准备...',
      error: undefined,
    })

    const ctx: TaskContext = {
      signal: this.abort.signal,
      throwIfCancelled: () => {
        if (this.abort?.signal.aborted) throw abortError()
      },
      report: (update) => {
        const current = update.current ?? this.snapshot.current
        const nextTotal = update.total ?? this.snapshot.total
        const elapsedMs = performance.now() - this.startedAt
        const percent = nextTotal > 0 ? Math.min(100, Math.round((current / nextTotal) * 100)) : 0
        const remainingMs = percent > 0 && percent < 100 ? Math.round((elapsedMs / percent) * (100 - percent)) : percent >= 100 ? 0 : null
        this.patch({ ...update, current, total: nextTotal, percent, elapsedMs, remainingMs })
      },
    }

    try {
      const result = await work(ctx)
      ctx.throwIfCancelled()
      this.patch({
        status: 'completed',
        percent: 100,
        remainingMs: 0,
        current: this.snapshot.total,
        message: '导出完成',
        elapsedMs: performance.now() - this.startedAt,
      })
      return result
    } catch (reason) {
      const elapsedMs = performance.now() - this.startedAt
      if (isAbortError(reason)) {
        this.patch({ status: 'cancelled', message: '已取消', elapsedMs })
        throw reason
      }
      const message = reason instanceof Error ? reason.message : '任务失败'
      this.patch({ status: 'failed', message, error: message, elapsedMs })
      throw reason
    }
  }

  private patch(update: Partial<TaskSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update }
    this.listeners.forEach((listener) => listener(this.snapshot))
  }
}
