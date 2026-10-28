/**
 * 美股行情 WebSocket 的 IPC 通道与共享类型
 * 主进程 ↔ 主窗口渲染进程 ↔ WebView preload 三方共用
 */

/** public = 公共行情；private = 订单/持仓/账户 */
export type WsKind = 'public' | 'private'

export const WS_CHANNELS = {
  /** webview preload → 主进程：下发订阅/退订/关闭指令 */
  CLIENT_SEND: 'usstock-ws:client-send',
  /** webview preload → 主进程：同步当前订阅集合（页面刷新恢复订阅用） */
  SYNC_SUBS: 'usstock-ws:sync-subs',
  /** 主进程 → 主窗口：行情推送 */
  MESSAGE: 'usstock-ws:message',
  /** 主进程 → 主窗口：连接状态 */
  STATUS: 'usstock-ws:status',
  /** 渲染进程 → 主进程：查询连接状态 */
  GET_STATUS: 'usstock-ws:get-status'
} as const

/** webview preload 发来的载荷 */
export interface WsIncomingPayload {
  /** public | private */
  kind?: 'public' | 'private'
  /** 原始 H5 报文（JSON 字符串），可能是 {op, args, ...} 或其子字段 */
  text: string
}

/** 主进程 → 渲染进程的推送事件 */
export interface WsMessageEvent {
  kind: 'public' | 'private'
  data: unknown
  timestamp: number
}

export interface WsStatusEvent {
  kind: 'public' | 'private'
  status: 'connected' | 'closed' | 'error' | 'login' | 'login-fail'
  detail?: unknown
  timestamp: number
}
