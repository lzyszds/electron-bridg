// ==================== 美股行情 WebSocket（移植自 us-stock-test） ====================
// 对应 Flutter 端 「美股订阅」能力，H5 通过 JSBridge 的 usStockPublic 下发订阅。
//
// 公共行情 ws（无需登录）：connect → subscribe → 每 30s 发纯文本 ping → 收到 action 推送
// 私有行情 ws（订单/持仓/账户）：connect → login(HMAC 签名) → subscribe → ping
//
// 两类连接最终都把消息通过 bridge.callHandler 回调给 H5，再同步到渲染进程日志面板。

import WebSocket from 'ws'
import { createHmac } from 'node:crypto'
import type { ClientOptions } from 'ws'

export const WS_PING_CMD = 'ping'
export const WS_HEARTBEAT_INTERVAL = 30000

/** public = 公共行情；private = 订单/持仓/账户 */
export type WsKind = 'public' | 'private'

/** H5 未指定 wsType 时，按订阅频道猜测走哪条连接 */
export function resolveWsKind(body: UsStockPublicPayload): WsKind {
  if (body.wsType === 'private' || body.wsType === 'public') return body.wsType
  const args = Array.isArray(body.args) ? body.args : []
  const privateChannels = ['orders', 'positions', 'account', 'fill']
  if (args.some((a) => privateChannels.includes(a?.channel))) {
    return args.some((a) => !privateChannels.includes(a?.channel)) ? 'public' : 'private'
  }
  return 'public'
}

/** 订阅项三要素（公共频道）+ 私有频道可能带 extHours */
export interface WsSubItem {
  instType: string
  channel: string
  instId: string
  extHours?: boolean
}

/** H5 下发的 usStockPublic 参数（兼容 cmd / data 多种包装） */
export interface UsStockPublicPayload {
  op?: 'subscribe' | 'unsubscribe' | 'close' | 'reconnect'
  args?: WsSubItem[]
  /** 非 JSON 的裸报文（如 'ping'） */
  raw?: string
  /** 传 private 时走私有连接（需已登录） */
  wsType?: WsKind
  data?: unknown
  clientType?: string
}

export interface PrivateWsCredential {
  apiKey: string
  secretKey: string
  passphrase: string
  clientType: string
}

type WsMessageHandler = (kind: WsKind, data: unknown) => void
export type WsConnectionState = 'connected' | 'closed' | 'error' | 'login' | 'login-fail'
type WsStatusHandler = (kind: WsKind, status: WsConnectionState, detail?: unknown) => void

/** 从 "wss://host/v2/ws/public" 推导私有地址 "wss://host/v2/ws/private" */
export function derivePrivateWsUrl(publicUrl: string): string {
  return publicUrl.replace(/\/public\/?$/, '/private')
}

/** 公共频道订阅命令 */
export function buildPublicSubscribeCmd(
  op: 'subscribe' | 'unsubscribe',
  items: WsSubItem[]
): string {
  return JSON.stringify({
    op,
    args: items.map((it) => ({ instType: it.instType, channel: it.channel, instId: it.instId }))
  })
}

/** 私有频道订阅命令（extHours 需要原样透传） */
export function buildPrivateSubscribeCmd(op: 'subscribe' | 'unsubscribe', items: WsSubItem[]): string {
  return JSON.stringify({ op, args: items })
}

/** HMAC-SHA256 签名：prehash = timestamp + 'GET' + '/user/verify' */
export function buildPrivateSign(timestamp: string, secretKey: string): string {
  const prehash = timestamp + 'GET' + '/user/verify'
  return createHmac('sha256', secretKey).update(prehash).digest('base64')
}

export function buildPrivateLoginCmd(cred: PrivateWsCredential): string {
  const timestamp = Date.now().toString()
  return JSON.stringify({
    op: 'login',
    args: [
      {
        apiKey: cred.apiKey,
        timestamp,
        passphrase: cred.passphrase,
        clientType: cred.clientType,
        sign: buildPrivateSign(timestamp, cred.secretKey)
      }
    ]
  })
}

function isHeartbeat(text: string): boolean {
  const t = text.trim()
  return t === 'pong' || t === 'ping'
}

/**
 * 单个 WS 连接。公共/私有共用一个类：
 * - public：open 后直接可用，subscribe 立即发送
 * - private：open 后发 login，收到 login code=0 后才算就绪，期间的订阅先缓存
 */
export class WsClient {
  readonly kind: WsKind
  private ws: WebSocket | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private pendingSends: string[] = []
  private loggedIn: boolean
  private url = ''

  constructor(
    kind: WsKind,
    private loginCred: PrivateWsCredential | null,
    private onMessage: WsMessageHandler,
    private onStatus: WsStatusHandler
  ) {
    this.kind = kind
    this.loggedIn = kind === 'public'
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  get ready(): boolean {
    return this.connected && (this.kind === 'public' || this.loggedIn)
  }

  connect(url: string, options: ClientOptions, subs?: WsSubItem[]): void {
    this.url = url
    this.loggedIn = this.kind === 'public'
    if (subs?.length) this.pendingSends.push(this.buildSubCmd('subscribe', subs))

    if (this.ws) this.ws.terminate()

    this.ws = new WebSocket(url, options)

    this.ws.on('open', () => {
      this.onStatus(this.kind, 'connected', { url, wsUrl: url })
      if (this.kind === 'private' && this.loginCred) {
        this.ws!.send(buildPrivateLoginCmd(this.loginCred))
      } else {
        this.flushPending()
        this.startHeartbeat()
      }
    })

    this.ws.on('message', (raw: WebSocket.Data) => {
      const text = raw.toString()
      if (isHeartbeat(text)) return
      let parsed: unknown = text
      try {
        parsed = JSON.parse(text)
      } catch {
        /* 非 JSON 原样透传 */
      }
      this.handleMessage(parsed)
    })

    this.ws.on('close', () => {
      this.loggedIn = this.kind === 'public'
      this.stopHeartbeat()
      this.onStatus(this.kind, 'closed', { url })
    })

    this.ws.on('error', (err: Error) => {
      this.loggedIn = this.kind === 'public'
      this.stopHeartbeat()
      this.onStatus(this.kind, 'error', { url, error: err.message })
    })
  }

  subscribe(op: 'subscribe' | 'unsubscribe', items: WsSubItem[]): void {
    if (!items.length) return
    const cmd = this.buildSubCmd(op, items)
    if (this.ready) {
      this.ws!.send(cmd)
    } else {
      this.pendingSends.push(cmd)
    }
  }

  /** 直接发送原始指令（兼容 H5 传 ping / 其它 op） */
  sendRaw(text: string): boolean {
    if (this.connected) {
      this.ws!.send(text)
      return true
    }
    return false
  }

  close(): void {
    this.stopHeartbeat()
    this.pendingSends = []
    this.loggedIn = this.kind === 'public'
    if (this.ws) {
      this.ws.terminate()
      this.ws = null
    }
    this.onStatus(this.kind, 'closed', { url: this.url })
  }

  private buildSubCmd(op: 'subscribe' | 'unsubscribe', items: WsSubItem[]): string {
    return this.kind === 'private'
      ? buildPrivateSubscribeCmd(op, items)
      : buildPublicSubscribeCmd(op, items)
  }

  private handleMessage(parsed: unknown): void {
    if (parsed && typeof parsed === 'object' && 'event' in parsed) {
      const evt = parsed as { event: string; code?: string; msg?: string }
      if (evt.event === 'login') {
        if (evt.code === '0') {
          this.loggedIn = true
          this.onStatus(this.kind, 'login', { url: this.url })
          this.startHeartbeat()
          this.flushPending()
        } else {
          this.onStatus(this.kind, 'login-fail', parsed)
        }
        return
      }
      if (evt.event === 'error') {
        this.onStatus(this.kind, 'error', parsed)
        return
      }
      // subscribe / unsubscribe 回执也交给上层（H5 需要感知订阅失败原因）
      this.onMessage(this.kind, parsed)
      return
    }
    this.onMessage(this.kind, parsed)
  }

  private flushPending(): void {
    if (!this.connected) return
    while (this.pendingSends.length) {
      this.ws!.send(this.pendingSends.shift()!)
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) this.ws!.send(WS_PING_CMD)
    }, WS_HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}

/**
 * 管理公共/私有两条美股 WS 连接。
 * 业务侧只关心：H5 下发订阅 → 这里负责连接、补发、保活，推送再回调给 H5。
 */
export class UsStockWsManager {
  private publicClient: WsClient | null = null
  private privateClient: WsClient | null = null
  // 断线前订阅记忆：重连后由 H5 重发，这里只用于日志与状态展示
  private publicSubs = new Map<string, WsSubItem>()
  private privateSubs = new Map<string, WsSubItem>()

  constructor(
    private getPublicUrl: () => string,
    private getPrivateConfig: () => {
      url: string
      credential: PrivateWsCredential | null
    },
    private getWsOptions: () => ClientOptions,
    private onMessage: WsMessageHandler,
    private onStatus: WsStatusHandler
  ) {}

  /** 解析并处理 H5 的 usStockPublic 指令，返回给 H5 的应答 */
  handle(kind: WsKind, payload: UsStockPublicPayload): Record<string, unknown> {
    // 兼容 { data: { op, args } } 的二次包装
    let body: UsStockPublicPayload = payload
    if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
      const inner = payload.data as UsStockPublicPayload
      if (inner.op || inner.args) body = { ...inner }
    }

    // 裸报文（如 'ping'）直接发给当前连接
    if (body.raw) {
      const client = this.ensureClient(kind)
      return { success: client?.sendRaw(body.raw) ?? false }
    }

    const op = body.op
    const args = Array.isArray(body.args) ? body.args : []

    if (op === 'reconnect') {
      this.reconnect(kind)
      return { success: true }
    }

    if (op === 'close') {
      this.clientOf(kind)?.close()
      return { success: true }
    }

    if (op === 'subscribe' || op === 'unsubscribe' || !op) {
      const client = this.ensureClient(kind)
      const subs = this.subsOf(kind)
      if (op === 'subscribe') args.forEach((a) => subs.set(`${a.channel}:${a.instId}`, a))
      if (op === 'unsubscribe') args.forEach((a) => subs.delete(`${a.channel}:${a.instId}`))
      const desiredOp = op === 'unsubscribe' ? 'unsubscribe' : 'subscribe'

      if (!client) {
        // 私有连接缺凭证时仍记住订阅，等 H5 重新登录后补发
        return {
          success: false,
          ready: false,
          count: args.length,
          msg: kind === 'private' ? '未登录，无法订阅私有频道' : 'WS 地址未配置'
        }
      }
      client.subscribe(desiredOp, args)
      return { success: true, ready: client.ready, count: args.length }
    }

    // 其它指令（ping 等）直接透传给当前连接
    if (typeof op === 'string') {
      const client = this.ensureClient(kind)
      return { success: client?.sendRaw(JSON.stringify(body)) ?? false }
    }
    return { success: false, msg: 'unknown op' }
  }

  /** 手动重连（H5 可调用 wsType 指定） */
  reconnect(kind: WsKind): void {
    this.clientOf(kind)?.close()
    this.clientOf(kind, true)
    this.ensureClient(kind)
  }

  closeAll(): void {
    this.publicClient?.close()
    this.privateClient?.close()
    this.publicClient = null
    this.privateClient = null
  }

  getStatus(): Record<string, unknown> {
    return {
      public: { connected: this.publicClient?.connected ?? false, ready: this.publicClient?.ready ?? false, count: this.publicSubs.size },
      private: { connected: this.privateClient?.connected ?? false, ready: this.privateClient?.ready ?? false, count: this.privateSubs.size }
    }
  }

  private subsOf(kind: WsKind): Map<string, WsSubItem> {
    return kind === 'private' ? this.privateSubs : this.publicSubs
  }

  private clientOf(kind: WsKind, take = false): WsClient | null {
    const c = kind === 'private' ? this.privateClient : this.publicClient
    if (take) {
      if (kind === 'private') this.privateClient = null
      else this.publicClient = null
    }
    return c
  }

  private ensureClient(kind: WsKind): WsClient | null {
    const existing = this.clientOf(kind)
    if (existing) return existing

    if (kind === 'public') {
      const url = this.getPublicUrl()
      if (!url) return null
      const client = new WsClient(kind, null, this.onMessage, this.onStatus)
      this.publicClient = client
      // 重连时带上已记录的订阅，避免断线期间新增的订阅丢失
      client.connect(url, this.getWsOptions(), Array.from(this.publicSubs.values()))
      return client
    }

    const { url, credential } = this.getPrivateConfig()
    if (!credential || !credential.secretKey) {
      console.warn('[UsStockWs] 私有 WS 缺少 secretKey，无法登录')
      return null
    }
    const client = new WsClient(kind, credential, this.onMessage, this.onStatus)
    this.privateClient = client
    client.connect(url, this.getWsOptions(), Array.from(this.privateSubs.values()))
    return client
  }
}
