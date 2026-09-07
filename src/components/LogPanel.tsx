import { useEffect, useMemo, useRef, useState } from 'react'
import { useLogStore } from '../store/useLogStore'
import type { LogEntry, LogSource } from '../bridge/types'
import { cn } from '../lib/utils'

type Filter = 'all' | LogSource

const levelColor: Record<string, string> = {
  log: 'text-zinc-300',
  info: 'text-blue-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
  debug: 'text-zinc-500',
  system: 'text-purple-400'
}

const sourceBadge: Record<LogSource, string> = {
  console: 'bg-zinc-700/40 text-zinc-400 border-zinc-600/30',
  bridge: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  system: 'bg-purple-500/15 text-purple-400 border-purple-500/20'
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const base = d.toLocaleTimeString('zh-CN', { hour12: false })
  return `${base}.${String(ts % 1000).padStart(3, '0')}`
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = entry.detail !== undefined && entry.detail !== null

  return (
    <div className="border-b border-zinc-800/60 px-2 py-1 font-mono text-[11px] leading-5 hover:bg-zinc-900">
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-zinc-600">{formatTime(entry.timestamp)}</span>
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded border px-1 text-[10px] uppercase',
            sourceBadge[entry.source]
          )}
        >
          {entry.source}
        </span>
        {entry.source === 'bridge' && entry.direction && (
          <span
            className={cn(
              'shrink-0 font-bold',
              entry.direction === 'in' ? 'text-emerald-400' : 'text-orange-400'
            )}
          >
            {entry.direction === 'in' ? '◀' : '▶'}
          </span>
        )}
        {entry.action && (
          <span className="shrink-0 font-semibold text-blue-400">{entry.action}</span>
        )}
        <span className={cn('min-w-0 flex-1 break-all', levelColor[entry.level] ?? 'text-zinc-300')}>
          {entry.message}
        </span>
        {hasDetail && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-[10px] text-zinc-500 hover:text-zinc-300"
          >
            {expanded ? '收起' : '详情'}
          </button>
        )}
      </div>
      {expanded && hasDetail && (
        <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-zinc-800/50 p-2 text-[10px] text-zinc-400">
          {JSON.stringify(entry.detail, null, 2)}
        </pre>
      )}
    </div>
  )
}

export function LogPanel() {
  const logs = useLogStore((s) => s.logs)
  const clearLogs = useLogStore((s) => s.clearLogs)
  const [filter, setFilter] = useState<Filter>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (filter === 'all') return logs
    return logs.filter((l) => l.source === filter)
  }, [logs, filter])

  useEffect(() => {
    if (!autoScroll) return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [filtered.length, autoScroll])

  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'console', label: 'Console' },
    { key: 'bridge', label: '桥接' },
    { key: 'system', label: '系统' }
  ]

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-300">
      {/* 标签栏 */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                filter === t.key
                  ? 'bg-blue-500 text-white'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1 text-[10px] text-zinc-500">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="h-3 w-3 accent-blue-500"
            />
            自动滚动
          </label>
          <button
            onClick={clearLogs}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            清空
          </button>
        </div>
      </div>
      {/* 日志列表 */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-600">
            暂无日志
          </div>
        ) : (
          filtered.map((entry) => <LogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  )
}
