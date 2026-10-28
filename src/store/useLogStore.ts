import { create } from 'zustand'
import type { LogEntry, LogSource, LogLevel, ElectronWirePayload } from '../bridge/types'

/**
 * 日志上限
 *
 * 每条日志都可能带完整请求/响应报文（wire），5000 条时内存能到几十 MB 且滚动卡顿。
 * 面板只可能看到有限条数，收到 2000 就足够回溯；超出的从头部丢弃。
 */
const MAX_LOGS = 2000

/** 合并写入的缓冲窗口：高频推送时不必每条都触发一次渲染 */
const FLUSH_MS = 80

export interface LogState {
  logs: LogEntry[]
  addLog: (entry: {
    source: LogSource
    level: LogLevel
    message: string
    detail?: unknown
    direction?: 'in' | 'out'
    action?: string
    wire?: ElectronWirePayload
  }) => void
  clearLogs: () => void
}

let logId = 0

/**
 * 桥接日志 store（内存态，不持久化）
 * 记录 H5 console 输出与桥接 request/response
 */
/** 待写入的日志缓冲与定时器（模块级，避免每次 addLog 都 setState） */
let pending: LogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

let applyFlush: ((batch: LogEntry[]) => void) | null = null

/** 立即把缓冲区写入 store（定时器触发 / 缓冲满 / 清空时调用） */
function flushLogs(): void {
  flushTimer = null
  if (!pending.length || !applyFlush) return
  const batch = pending
  pending = []
  applyFlush(batch)
}

export const useLogStore = create<LogState>((set) => {
  applyFlush = (batch: LogEntry[]) => {
    set((state) => {
      // 每批只拷贝一次数组，比逐条 [...logs, next] 便宜得多
      const logs = state.logs.concat(batch)
      if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
      return { logs }
    })
  }

  return {
    logs: [],
    addLog: (entry) => {
      pending.push({
        id: logId++,
        timestamp: Date.now(),
        source: entry.source,
        level: entry.level,
        message: entry.message,
        detail: entry.detail,
        direction: entry.direction,
        action: entry.action,
        wire: entry.wire
      })
      // 缓冲超过上限时立刻冲刷，避免定时器还没跑就堆积
      if (pending.length >= 200) {
        if (flushTimer) clearTimeout(flushTimer)
        flushLogs()
        return
      }
      if (!flushTimer) flushTimer = setTimeout(flushLogs, FLUSH_MS)
    },
    clearLogs: () => {
      pending = []
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      set({ logs: [] })
    }
  }
})