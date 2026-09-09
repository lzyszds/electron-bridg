import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  ArrowUpRight,
  Layers,
  Copy,
  Check,
  Clock,
  HardDrive,
  Code2,
  Send,
  CornerDownRight
} from 'lucide-react'
import { useLogStore } from '../store/useLogStore'
import type { LogEntry, LogSource, ElectronWirePayload } from '../bridge/types'
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
  electron: 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border-blue-300 font-bold',
  system: 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const base = d.toLocaleTimeString('zh-CN', { hour12: false })
  return `${base}.${String(ts % 1000).padStart(3, '0')}`
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** 生成可在终端直接运行的完整 cURL 脚本命令 */
function buildCurlCommand(wire: ElectronWirePayload): string {
  if (!wire.request?.url) return ''
  const method = (wire.request.method || 'GET').toUpperCase()
  let curl = `curl -X ${method} "${wire.request.url}"`

  if (wire.request.headers) {
    Object.entries(wire.request.headers).forEach(([k, v]) => {
      curl += ` \\\n  -H "${k}: ${String(v).replace(/"/g, '\\"')}"`
    })
  }

  if (wire.request.body !== undefined && wire.request.body !== null && method !== 'GET') {
    const bodyStr =
      typeof wire.request.body === 'string'
        ? wire.request.body
        : JSON.stringify(wire.request.body)
    curl += ` \\\n  --data '${bodyStr.replace(/'/g, "'\\''")}'`
  }

  return curl
}

/**
 * Electron 桥接底层请求与响应完全体检查器
 */
function ElectronWireViewer({ wire }: { wire: ElectronWirePayload }) {
  const [activeTab, setActiveTab] = useState<'request' | 'response' | 'curl' | 'raw'>('request')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1800)
  }

  const req = wire.request
  const resp = wire.response
  const method = (req?.method || 'POST').toUpperCase()
  const status = resp?.status ?? wire.status ?? 200
  const isOk = status >= 200 && status < 300
  const curlCmd = useMemo(() => buildCurlCommand(wire), [wire])

  // 重点识别重要 Headers
  const isKeyHeader = (name: string) => {
    const lower = name.toLowerCase()
    return (
      lower === 'authorization' ||
      lower === 'x-signature' ||
      lower === 'x-timestamp' ||
      lower === 'x-nonce' ||
      lower === 'token' ||
      lower === 'kbit-token' ||
      lower === 'operationid' ||
      lower === 'deviceid' ||
      lower === 'userid'
    )
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-2.5 rounded-xl border border-blue-200/80 bg-gradient-to-b from-blue-50/20 to-white shadow-xs overflow-hidden font-sans text-xs text-slate-800 select-text"
    >
      {/* 头部元信息栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50/90 border-b border-slate-200/80">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'px-2 py-0.5 rounded text-[10px] font-mono font-black tracking-wider uppercase',
              method === 'GET'
                ? 'bg-blue-600 text-white'
                : method === 'POST'
                  ? 'bg-emerald-600 text-white'
                  : method === 'PUT'
                    ? 'bg-amber-600 text-white'
                    : 'bg-indigo-600 text-white'
            )}
          >
            {method}
          </span>
          <span
            className={cn(
              'px-2 py-0.5 rounded font-mono text-[10px] font-bold border',
              isOk
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            )}
          >
            {status} {resp?.statusText || wire.statusText || (isOk ? 'OK' : 'Error')}
          </span>

          <span className="font-mono text-[11px] font-medium text-slate-800 truncate max-w-[400px] xl:max-w-[550px]" title={req?.url || wire.channel}>
            {req?.url || wire.channel}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 font-mono text-[10px] text-slate-500">
          {wire.durationMs !== undefined && (
            <span className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-slate-200">
              <Clock className="w-3 h-3 text-blue-500" />
              <span>{wire.durationMs}ms</span>
            </span>
          )}
          {wire.sizeBytes !== undefined && wire.sizeBytes > 0 && (
            <span className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-slate-200">
              <HardDrive className="w-3 h-3 text-slate-400" />
              <span>{formatBytes(wire.sizeBytes)}</span>
            </span>
          )}
        </div>
      </div>

      {/* 视图 Tab 切换 */}
      <div className="flex items-center justify-between px-3 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-1 py-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('request')}
            className={cn(
              'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5',
              activeTab === 'request'
                ? 'bg-blue-50 text-blue-700 shadow-2xs font-bold'
                : 'text-slate-500 hover:text-slate-800'
            )}
          >
            <Send className="w-3 h-3" />
            <span>请求完全体 (Request)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('response')}
            className={cn(
              'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5',
              activeTab === 'response'
                ? 'bg-emerald-50 text-emerald-700 shadow-2xs font-bold'
                : 'text-slate-500 hover:text-slate-800'
            )}
          >
            <CornerDownRight className="w-3 h-3" />
            <span>服务端响应 (Response)</span>
          </button>

          {curlCmd && (
            <button
              type="button"
              onClick={() => setActiveTab('curl')}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 font-mono',
                activeTab === 'curl'
                  ? 'bg-purple-50 text-purple-700 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              )}
            >
              <Terminal className="w-3 h-3" />
              <span>cURL 命令</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('raw')}
            className={cn(
              'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5',
              activeTab === 'raw'
                ? 'bg-slate-100 text-slate-800 shadow-2xs font-bold'
                : 'text-slate-500 hover:text-slate-800'
            )}
          >
            <Code2 className="w-3 h-3" />
            <span>原始报文</span>
          </button>
        </div>

        {/* 快捷复制动作 */}
        {curlCmd && (
          <button
            type="button"
            onClick={() => handleCopy(curlCmd, 'curl-quick')}
            className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-0.5 rounded transition-colors cursor-pointer"
            title="一键复制终端 cURL 请求命令"
          >
            {copiedKey === 'curl-quick' ? (
              <>
                <Check className="w-3 h-3 text-emerald-600" />
                <span className="text-emerald-600 font-semibold">已复制 cURL</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>复制 cURL</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Tab 1: 请求完全体 */}
      {activeTab === 'request' && (
        <div className="p-3 space-y-3 bg-slate-50/40">
          {/* 请求 URL 展区 */}
          {req?.url && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                <span>完整请求 URL (Target)</span>
                <button
                  type="button"
                  onClick={() => handleCopy(req.url || '', 'req-url')}
                  className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'req-url' ? '已复制' : '复制 URL'}
                </button>
              </div>
              <div className="p-2 rounded-lg bg-white border border-slate-200 font-mono text-[11px] text-slate-800 break-all select-text shadow-2xs">
                {req.url}
              </div>
            </div>
          )}

          {/* 请求头 Headers 完全体展示表格 */}
          {req?.headers && Object.keys(req.headers).length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span>请求头完全体 (Headers)</span>
                  <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200 font-normal">
                    {Object.keys(req.headers).length} 个字段
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(JSON.stringify(req.headers, null, 2), 'headers-json')}
                  className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                >
                  {copiedKey === 'headers-json' ? '已复制全部' : '复制 JSON'}
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs">
                <div className="max-h-[220px] overflow-y-auto divide-y divide-slate-100 font-mono text-[11px]">
                  {Object.entries(req.headers).map(([key, val]) => {
                    const isSpecial = isKeyHeader(key)
                    return (
                      <div
                        key={key}
                        className={cn(
                          'flex items-start justify-between px-2.5 py-1.5 gap-2 transition-colors',
                          isSpecial ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-slate-50'
                        )}
                      >
                        <span
                          className={cn(
                            'font-semibold shrink-0 select-text',
                            isSpecial ? 'text-blue-700' : 'text-slate-600'
                          )}
                        >
                          {key}:
                        </span>
                        <span className="text-slate-800 break-all select-text text-right font-medium">
                          {String(val)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 请求 Body 展示 */}
          {(req?.body !== undefined || req?.rawBody !== undefined) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span>实际发送 Body 载荷</span>
                  {req?.rawBody !== undefined && (
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 rounded border border-emerald-200 font-normal">
                      含明文对照
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      typeof req?.body === 'string'
                        ? req.body
                        : JSON.stringify(req?.body, null, 2),
                      'body-json'
                    )
                  }
                  className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                >
                  {copiedKey === 'body-json' ? '已复制' : '复制 Body'}
                </button>
              </div>

              {/* 加密后的实际发送报文 */}
              <div className="rounded-lg border border-slate-200 bg-white p-2.5 font-mono text-[11px] text-slate-800 max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all shadow-2xs">
                {typeof req?.body === 'string'
                  ? req.body
                  : JSON.stringify(req?.body, null, 2)}
              </div>

              {/* 明文对照展示 */}
              {req?.rawBody !== undefined && req.rawBody !== req.body && (
                <div className="pt-1">
                  <div className="text-[10px] font-semibold text-emerald-700 mb-1">
                    未加密原始业务参数明文 (H5 原文对照):
                  </div>
                  <pre className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 font-mono text-[10px] text-emerald-900 max-h-[140px] overflow-y-auto whitespace-pre-wrap break-all">
                    {typeof req.rawBody === 'string'
                      ? req.rawBody
                      : JSON.stringify(req.rawBody, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: 服务端响应 */}
      {activeTab === 'response' && (
        <div className="p-3 space-y-3 bg-slate-50/40">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
            <span>服务端响应数据 (Response Body)</span>
            <button
              type="button"
              onClick={() =>
                handleCopy(
                  typeof resp?.data === 'string'
                    ? resp.data
                    : JSON.stringify(resp?.data, null, 2),
                  'resp-json'
                )
              }
              className="text-[10px] text-blue-600 hover:underline cursor-pointer"
            >
              {copiedKey === 'resp-json' ? '已复制响应' : '复制 JSON'}
            </button>
          </div>

          <pre className="rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] text-slate-800 max-h-[260px] overflow-y-auto whitespace-pre-wrap break-all shadow-2xs">
            {resp?.data !== undefined
              ? typeof resp.data === 'string'
                ? resp.data
                : JSON.stringify(resp.data, null, 2)
              : '无响应数据或空响应'}
          </pre>

          {/* 响应头展示 */}
          {resp?.headers && Object.keys(resp.headers).length > 0 && (
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-600">响应头 (Response Headers)</span>
              <div className="rounded-lg border border-slate-200 bg-white p-2 font-mono text-[10px] text-slate-700 max-h-[120px] overflow-y-auto">
                {Object.entries(resp.headers).map(([k, v]) => (
                  <div key={k} className="break-all select-text py-0.5">
                    <span className="font-semibold text-slate-500">{k}:</span> {v}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: cURL 命令直接回放 */}
      {activeTab === 'curl' && curlCmd && (
        <div className="p-3 space-y-2 bg-slate-900 text-slate-200">
          <div className="flex items-center justify-between text-[11px] text-slate-300">
            <span className="font-mono">可以在终端直接粘贴运行复现该请求：</span>
            <button
              type="button"
              onClick={() => handleCopy(curlCmd, 'curl-tab')}
              className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-bold cursor-pointer"
            >
              {copiedKey === 'curl-tab' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">已复制到剪贴板</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制 cURL</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-3 rounded-lg bg-black/70 border border-slate-800 font-mono text-[11px] text-emerald-400 whitespace-pre-wrap break-all max-h-[260px] overflow-y-auto select-text shadow-inner">
            {curlCmd}
          </pre>
        </div>
      )}

      {/* Tab 4: 原始报文 */}
      {activeTab === 'raw' && (
        <div className="p-3 bg-slate-50/40">
          <pre className="rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] text-slate-800 max-h-[260px] overflow-y-auto whitespace-pre-wrap break-all shadow-2xs">
            {JSON.stringify(wire, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const isWire = !!entry.wire || entry.source === 'electron'
  const hasDetail = (entry.detail !== undefined && entry.detail !== null) || isWire

  return (
    <div
      onClick={() => hasDetail && setExpanded((v) => !v)}
      className={cn(
        'border-b border-slate-100 px-3 py-1.5 font-mono text-[11px] leading-5 transition-colors group',
        hasDetail ? 'cursor-pointer hover:bg-blue-50/40' : 'hover:bg-slate-50',
        entry.level === 'error' && 'bg-rose-50/40',
        isWire && 'bg-blue-50/20',
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
          {entry.source === 'electron' ? '⚡ ELECTRON' : entry.source}
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
          <span className="shrink-0 font-semibold text-indigo-700 bg-indigo-50 px-1.5 rounded border border-indigo-200 text-[10px]">
            {entry.action}
          </span>
        )}

        {/* 日志内容主体 */}
        <span
          className={cn(
            'min-w-0 flex-1 break-all select-text',
            isWire && 'font-bold text-slate-900',
            levelColor[entry.level] ?? 'text-slate-700'
          )}
        >
          {entry.message}
        </span>

        {/* 详情小徽标提示 */}
        {hasDetail && (
          <span
            className={cn(
              'shrink-0 text-[10px] px-1.5 py-0.2 rounded font-sans transition-colors',
              isWire
                ? 'bg-blue-100 text-blue-700 font-bold'
                : 'bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-700'
            )}
          >
            {expanded ? '收起' : isWire ? '查看完全体' : '详情'}
          </span>
        )}
      </div>

      {/* 展开区域：若为 Electron Wire 完全体则渲染专用完全体查看器，否则渲染标准 Pre */}
      {expanded && hasDetail && (
        <div className="ml-5 mr-1">
          {entry.wire ? (
            <ElectronWireViewer wire={entry.wire} />
          ) : (
            <div onClick={(e) => e.stopPropagation()} className="mt-2">
              <pre className="whitespace-pre-wrap break-all rounded-lg bg-slate-50 border border-slate-200/90 p-3 text-[11px] text-slate-800 select-text overflow-x-auto shadow-inner font-mono">
                {typeof entry.detail === 'string'
                  ? entry.detail
                  : JSON.stringify(entry.detail, null, 2)}
              </pre>
            </div>
          )}
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
      electron: logs.filter((l) => l.source === 'electron').length,
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

  const tabs: { key: Filter; label: string; count: number; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'all', label: '全部', count: counts.all, icon: ListFilter },
    { key: 'electron', label: 'Electron 完全体', count: counts.electron, icon: Layers },
    { key: 'bridge', label: '桥接 (H5)', count: counts.bridge, icon: Radio },
    { key: 'console', label: 'Console', count: counts.console, icon: Terminal },
    { key: 'system', label: '系统', count: counts.system, icon: Cpu }
  ]

  return (
    <div className="flex h-full flex-col bg-white text-slate-800 select-none">
      {/* 顶栏：分类标签与搜索 */}
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 bg-slate-50 gap-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = filter === t.key
            const TabIcon = t.icon
            const isElectronTab = t.key === 'electron'
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all cursor-pointer font-medium shrink-0',
                  active
                    ? isElectronTab
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs font-bold'
                      : 'bg-blue-600 text-white shadow-xs font-bold'
                    : isElectronTab && counts.electron > 0
                      ? 'text-blue-700 bg-blue-50/80 hover:bg-blue-100 hover:text-blue-900 border border-blue-200'
                      : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                )}
              >
                <TabIcon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.2 rounded-full font-mono',
                    active
                      ? 'bg-white/20 text-white'
                      : isElectronTab && counts.electron > 0
                        ? 'bg-blue-200/60 text-blue-800 font-bold'
                        : 'bg-slate-200 text-slate-600'
                  )}
                >
                  {t.count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
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
            placeholder="过滤请求与桥接关键词 (url, method, channel, action)..."
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
            <p className="text-xs font-sans">
              {filter === 'electron'
                ? '暂无 Electron 方向桥接完全体报文'
                : '暂无匹配的调试日志'}
            </p>
          </div>
        ) : (
          filtered.map((entry) => <LogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  )
}


