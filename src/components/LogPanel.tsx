import { useEffect, useMemo, useRef, useState } from 'react'
import { useLogStore } from '../store/useLogStore'
import type { LogEntry, LogSource } from '../bridge/types'
import { cn } from '../lib/utils'

type Filter = 'all' | LogSource

const levelColor: Record<string, string> = {
  log: 'text-foreground',
  info: 'text-blue-500',
  warn: 'text-amber-500',
  error: 'text-red-500',
  debug: 'text-zinc-500',
  system: 'text-purple-500'
}

const sourceBadge: Record<LogSource, string> = {
  console: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
  bridge: 'bg-primary/10 text-primary border-primary/20',
  system: 'bg-purple-500/10 text-purple-500 border-purple-500/20'
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
    <div className="border-b border-border/60 px-2 py-1 font-mono text-[11px] leading-5">
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-zinc-400">{formatTime(entry.timestamp)}</span>
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
              entry.direction === 'in' ? 'text-emerald-500' : 'text-orange-500'
            )}
          >
            {entry.direction === 'in' ? '◀' : '▶'}
          </span>
        )}
        {entry.action && (
          <span className="shrink-0 font-semibold text-primary">{entry.action}</span>
        )}
        <span className="min-w-0 flex-1 break-all text-foreground/80">
          {entry.message}
        </span>
        {hasDetail && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-[10px] text-zinc-400 hover:text-foreground"
          >
            {expanded ? '收起' : '详情'}
          </button>
        )}
      </div>
      {expanded && hasDetail && (
        <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-zinc-500/5 p-2 text-[10px] text-zinc-400">
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
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (filter === 'all') return logs
    return logs.filter((l) => l.source === filter)
  }, [logs, filter])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [filtered.length])

  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'console', label: 'Console' },
    { key: 'bridge', label: '桥接' },
    { key: 'system', label: '系统' }
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                filter === t.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={clearLogs}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          清空
        </button>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            暂无日志
          </div>
        ) : (
          filtered.map((entry) => <LogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  )
}