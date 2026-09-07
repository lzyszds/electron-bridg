import { create } from 'zustand'
import type { LogEntry, LogSource, LogLevel } from '../bridge/types'

const MAX_LOGS = 5000

interface LogState {
  logs: LogEntry[]
  addLog: (entry: {
    source: LogSource
    level: LogLevel
    message: string
    detail?: unknown
    direction?: 'in' | 'out'
    action?: string
  }) => void
  clearLogs: () => void
}

let logId = 0

/**
 * 桥接日志 store（内存态，不持久化）
 * 记录 H5 console 输出与桥接 request/response
 */
export const useLogStore = create<LogState>((set) => ({
  logs: [],
  addLog: (entry) =>
    set((state) => {
      const next: LogEntry = {
        id: logId++,
        timestamp: Date.now(),
        source: entry.source,
        level: entry.level,
        message: entry.message,
        detail: entry.detail,
        direction: entry.direction,
        action: entry.action
      }
      const logs = [...state.logs, next]
      if (logs.length > MAX_LOGS) {
        logs.splice(0, logs.length - MAX_LOGS)
      }
      return { logs }
    }),
  clearLogs: () => set({ logs: [] })
}))