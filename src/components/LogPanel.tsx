import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ListFilter,
  Terminal,
  Radio,
  Cpu,
  Search,
  X,
  ChevronRight,
  Inbox,
  ArrowDownLeft,
  ArrowUpRight
} from 'lucide-react'
import { useLogStore } from '../store/useLogStore'
import type { LogEntry, LogSource } from '../bridge/types'
import { cn } from '../lib/utils'

type Filter = 'all' | LogSource

const levelColor: Record<string, string> = {
  log: 'text-slate-800',
  info: 'text-sky-700',
  warn: 'text-amber-700 font-medium',
  error: 'text-rose-700 font-semibold',
  debug: 'text-slate-500',
  system: 'text-purple-700'
}

const levelBadge: Record<string, string> = {
  log: 'bg-slate-100 text-slate-700 border-slate-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  error: 'bg-rose-50 text-rose-800 border-rose-200',
  debug: 'bg-slate-100 text-slate-500 border-slate-200',
  system: 'bg-purple-50 text-purple-800 border-purple-200'
}

const sourceBadge: Record<LogSource, string> = {
  console: 'bg-slate-100 text-slate-600 border-slate-200',
  bridge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  system: 'bg-emerald-50 text-emerald-700 border-emerald-200'
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
    <div
      onClick={() => hasDetail && setExpanded((v) => !v)}
      className={cn(
        'border-b border-slate-100 px-3 py-1.5 font-mono text-[11px] leading-5 transition-colors group',
        hasDetail ? 'cursor-pointer hover:bg-blue-50/40' : 'hover:bg-slate-50',
        entry.level === 'error' && 'bg-rose-50/40',
        expanded && 'bg-blue-50/30'
      )}
      title={hasDetail ? '点击展开/收起详情数据' : undefined}
    >
      <div className="flex items-start gap-2">
        {/* 详情展开指示小箭头 */}
        {hasDetail ? (
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400 transition-transform duration-150',
              expanded && 'rotate-90 text-blue-600'
            )}
          />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        <span className="shrink-0 text-slate-400 select-none text-[10px] pt-0.5 font-sans">
          {formatTime(entry.timestamp)}
        </span>

        {/* 来源 */}
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded px-1.5 py-0.2 text-[9px] uppercase font-bold border tracking-wider',
            sourceBadge[entry.source]
          )}
        >
          {entry.source}
        </span>

        {/* 级别 */}
        {entry.level && entry.level !== 'log' && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded px-1 text-[9px] uppercase font-bold border',
              levelBadge[entry.level] || 'bg-slate-100 text-slate-600 border-slate-200'
            )}
          >
            {entry.level}
          </span>
        )}

        {/* 桥接方向与动作 */}
        {entry.source === 'bridge' && entry.direction && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 shrink-0 font-bold text-[10px]',
              entry.direction === 'in' ? 'text-emerald-600' : 'text-amber-600'
            )}
            title={entry.direction === 'in' ? '调用桥接方法 (REQ)' : '接收桥接响应 (RES)'}
          >
            {entry.direction === 'in' ? (
              <ArrowDownLeft className="w-3 h-3 stroke-[2.5]" />
            ) : (
              <ArrowUpRight className="w-3 h-3 stroke-[2.5]" />
            )}
            <span>{entry.direction === 'in' ? 'REQ' : 'RES'}</span>
          </span>
        )}
        {entry.action && (
          <span className="shrink-0 font-semibold text-indigo-700 bg-indigo-50 px-1.5 rounded border border-indigo-200">
            {entry.action}
          </span>
        )}

        {/* 日志内容主体 */}
        <span
          className={cn(
            'min-w-0 flex-1 break-all select-text',
            levelColor[entry.level] ?? 'text-slate-700'
          )}
        >
          {entry.message}
        </span>

        {/* 详情小徽标提示 */}
        {hasDetail && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-sans group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors">
            {expanded ? '收起' : '详情'}
          </span>
        )}
      </div>

      {expanded && hasDetail && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-2 ml-5 mr-1"
        >
          <pre className="whitespace-pre-wrap break-all rounded-lg bg-slate-50 border border-slate-200/90 p-3 text-[11px] text-slate-800 select-text overflow-x-auto shadow-inner font-mono">
            {typeof entry.detail === 'string'
              ? entry.detail
              : JSON.stringify(entry.detail, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export function LogPanel() {
  const logs = useLogStore((s) => s.logs)
  const clearLogs = useLogStore((s) => s.clearLogs)
  const [filter, setFilter] = useState<Filter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  // 统计各类型日志条数
  const counts = useMemo(() => {
    return {
      all: logs.length,
      console: logs.filter((l) => l.source === 'console').length,
      bridge: logs.filter((l) => l.source === 'bridge').length,
      system: logs.filter((l) => l.source === 'system').length
    }
  }, [logs])

  const filtered = useMemo(() => {
    let list = filter === 'all' ? logs : logs.filter((l) => l.source === filter)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (l) =>
          l.message.toLowerCase().includes(q) ||
          (l.action && l.action.toLowerCase().includes(q)) ||
          (l.level && l.level.toLowerCase().includes(q))
      )
    }
    return list
  }, [logs, filter, searchQuery])

  useEffect(() => {
    if (!autoScroll) return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [filtered.length, autoScroll])

  const tabs: { key: Filter; label: string; count: number; icon: typeof ListFilter }[] = [
    { key: 'all', label: '全部', count: counts.all, icon: ListFilter },
    { key: 'console', label: 'Console', count: counts.console, icon: Terminal },
    { key: 'bridge', label: '桥接', count: counts.bridge, icon: Radio },
    { key: 'system', label: '系统', count: counts.system, icon: Cpu }
  ]

  return (
    <div className="flex h-full flex-col bg-white text-slate-800 select-none">
      {/* 顶栏：分类标签与搜索 */}
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 bg-slate-50 gap-2">
        <div className="flex items-center gap-1">
          {tabs.map((t) => {
            const active = filter === t.key
            const TabIcon = t.icon
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all cursor-pointer font-medium',
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                )}
              >
                <TabIcon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.2 rounded-full font-mono',
                    active ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'
                  )}
                >
                  {t.count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* 自动滚动切换 */}
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600 hover:text-slate-900">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-blue-600 cursor-pointer"
            />
            <span>自动滚屏</span>
          </label>

          {/* 清空日志 */}
          <button
            type="button"
            onClick={clearLogs}
            className="rounded px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors cursor-pointer font-medium"
            title="清空当前日志"
          >
            清空
          </button>
        </div>
      </div>

      {/* 搜索过滤输入框 */}
      <div className="px-3 py-1.5 border-b border-slate-100 bg-white flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="过滤日志关键字 (message, action, level)..."
            className="w-full h-7 pl-7 pr-7 text-xs rounded-md bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 font-mono"
          />
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <span className="text-[10px] text-slate-400 shrink-0 font-mono">
          {filtered.length} 条记录
        </span>
      </div>

      {/* 日志列表容器 */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 text-slate-400">
            <Inbox className="w-8 h-8 stroke-[1.5] mb-1.5 opacity-60" />
            <p className="text-xs font-sans">暂无匹配的调试日志</p>
          </div>
        ) : (
          filtered.map((entry) => <LogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  )
}

