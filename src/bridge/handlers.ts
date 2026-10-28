import type { WebviewTag } from 'electron'
import { JsBridge } from './jsbridge'
import { DEFAULT_PUB_KEY, type BridgeConfig, type ElectronWirePayload, type LogLevel } from './types'
import { getDeviceProfile, type DevicePlatform } from './device-profiles'
import type { HttpResponseResult } from '../../electron/shared/bridge'
import type { WsMessageEvent, WsStatusEvent } from '../../electron/shared/ws'

/**
 * getAppInfo 回传的宿主 App 信息（H5 侧按 appName 区分品牌，必须严格对齐大小写）
 *
 * 取值由客户端约定：version 形如 `v2.0.01`，appName 只允许以下四种品牌：
 *   qqlink / qqlinkpro / qqlinkplus / qqlive
 *
 * 后续字段按需增量追加（例如 buildNumber、platform），H5 只读它需要的键，
 * 新增字段不会影响已接入的版本。
 */
const APP_INFO = {
  /** 宿主 App 版本号，带 v 前缀 */
  version: 'v2.0.01',
  /** 宿主 App 品牌名 */
  appName: 'qqlink'
} as const

/**
 * 模拟机型的语言/地区（Flutter DeviceInfoHelper 读取系统 Locale）
 *
 * TODO: 需要多语言联调时改为跟随 appConfig.locale（zh-hans / zh-hant / en），
 * 并同步把 `zh-CN` 换成对应的 `zh_CN` / `en_US` 形式。
 */
const APP_LANGUAGE = 'zh_CN'

/** 取本机时区偏移串（如 GMT+08:00），失败时兜底东八区 */
function resolveTimeZoneOffset(): string {
  try {
    const offsetMin = -new Date().getTimezoneOffset()
    const sign = offsetMin >= 0 ? '+' : '-'
    const abs = Math.abs(offsetMin)
    const hh = String(Math.floor(abs / 60)).padStart(2, '0')
    const mm = String(abs % 60).padStart(2, '0')
    return `GMT${sign}${hh}:${mm}`
  } catch {
    return 'GMT+08:00'
  }
}

export interface HandlerDeps {
  /** 获取当前 webview 实例 */
  getWebview: () => WebviewTag | null
  /** 读取最新桥接配置 */
  getConfig: () => BridgeConfig
  /** 记录系统日志 */
  log: (message: string, detail?: unknown) => void
  /** 记录 Electron 方向的完全体请求/响应报文 */
  logWire?: (entry: {
    action: string
    message: string
    level?: LogLevel
    detail?: unknown
    wire: ElectronWirePayload
  }) => void
  /** Token 错误或过期回调 */
  onAuthExpired?: (reason?: string) => void
  /** 带来源 / 级别 / 方向的日志写入（WS 行情等） */
  onLog?: (entry: {
    source: 'ws'
    level: LogLevel
    direction?: 'in' | 'out'
    action?: string
    message: string
    detail?: unknown
  }) => void
}

/**
 * 校验请求返回是否为 Token 错误或已过期
 */
function checkAuthError(status: number, data: unknown): string | null {
  if (status === 401) return 'HTTP 401 登录已失效'
  if (status === 403) return 'HTTP 403 权限不足或登录过期'
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const errCode = obj.errCode ?? obj.ErrCode ?? obj.code ?? obj.Code
    const errMsg = String(obj.errMsg ?? obj.ErrMsg ?? obj.errDlt ?? obj.ErrDlt ?? obj.message ?? '')

    // 常见 Token 错误码 (1001: 未登录/Token错误, 1004: Token过期, 401: Unauthorized, -1: 服务端 token 解析失败)
    const codeNum = Number(errCode)
    if (codeNum === 1001 || codeNum === 1004 || codeNum === 401 || codeNum === -1) {
      return errMsg || `Token 错误/已过期 (错误码: ${errCode})`
    }

    // 关键词匹配
    if (
      /token.*(expired|invalid|null|empty)/i.test(errMsg) ||
      /invalid.*token/i.test(errMsg) ||
      /token.*过期/i.test(errMsg) ||
      /登录.*过期/i.test(errMsg) ||
      /未登录/i.test(errMsg) ||
      /请重新登录/i.test(errMsg) ||
      /token.*解析失败/i.test(errMsg) ||
      /token.*(不匹配|不一致)/i.test(errMsg) ||
      /TokenException/i.test(errMsg)
    ) {
      return errMsg
    }
  }
  return null
}

function extractUrl(data: unknown): string | undefined {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (typeof obj.url === 'string') return obj.url
    if (obj.data && typeof obj.data === 'object') {
      const inner = obj.data as Record<string, unknown>
      if (typeof inner.url === 'string') return inner.url
    }
  }
  return undefined
}

function resolvePlatform(config: BridgeConfig): DevicePlatform {
  if (config.auth.platform !== 'auto') return config.auth.platform
  return getDeviceProfile(config.deviceId).platform
}

function buildAuthData(config: BridgeConfig): Record<string, unknown> {
  const { secretKey, token, chatToken, imToken, userID } = config.auth
  const base = {
    secretKey,
    token,
    chatToken,
    imToken,
    userID: userID || config.auth.userID
  }
  // 兼容 H5 直接读 res.secretKey 和 res.data.secretKey 两种风格
  return {
    ...base,
    data: base
  }
}

/**
 * 注册全部桥接 handler，复刻 Flutter 端 JsBridgeController.initRegisiter()
 * 简单能力真实实现，依赖 Flutter 原生库的能力（IM/支付/钱包）返回可配置 mock。
 */
export function registerHandlers(bridge: JsBridge, deps: HandlerDeps): void {
  const { getWebview, getConfig, log } = deps
  /** 带来源/级别/方向的日志（WS 行情标签需要） */
  const addLog = deps.onLog ?? (() => {})

  /** WS 推送：写入调试日志（WS 行情标签），并交给连接器 / 页面做状态同步 */
  const handleWsMessage = (event: WsMessageEvent) => {
    const msg = event?.data
    const isAck = !!msg && typeof msg === 'object' && 'event' in (msg as Record<string, unknown>)
    const ack = msg as { event?: string; code?: string; msg?: string } | undefined
    if (isAck) {
      const ok = ack?.code === '0'
      addLog({
        source: 'ws',
        level: ok ? 'info' : 'warn',
        direction: 'in',
        action: `${event.kind}:${ack?.event}`,
        message: `← 订阅回执 ${ack?.event} code=${ack?.code}${ack?.msg ? ` msg=${ack.msg}` : ''}`,
        detail: msg
      })
    } else {
      addLog({
        source: 'ws',
        level: 'log',
        direction: 'in',
        action: `${event.kind}:action`,
        message: `← 行情推送 ${describeAction(msg)}`,
        detail: msg
      })
    }
  }

  const handleWsStatus = (status: WsStatusEvent) => {
    const level = status.status === 'error' || status.status === 'login-fail' ? 'warn' : 'info'
    const label: Record<string, string> = {
      connected: '已连接',
      closed: '已关闭',
      error: '异常',
      login: '登录成功',
      'login-fail': '登录失败'
    }
    addLog({
      source: 'ws',
      level,
      action: `${status.kind}:${status.status}`,
      message: `WS ${status.kind === 'public' ? '公共行情' : '私有频道'} ${label[status.status] ?? status.status}`,
      detail: status.detail
    })
  }

  /** 行情 action 消息的一行摘要：action / instId / 关键字段 */
  const describeAction = (msg: unknown): string => {
    if (!msg || typeof msg !== 'object') return String(msg)
    const obj = msg as {
      action?: string
      channel?: string
      arg?: { instId?: string; channel?: string }
      data?: unknown
    }
    const parts = [obj.action, obj.channel ?? obj.arg?.channel, obj.arg?.instId].filter(Boolean)
    const data = obj.data
    const first = Array.isArray(data) ? data[0] : data
    return `${parts.join(' / ')} ${first && typeof first === 'object' ? JSON.stringify(first).slice(0, 120) : ''}`.trim()
  }

  const mock = (name: string, handler?: (data: unknown) => unknown) => {
    bridge.registerHandler(name, async (data) => {
      log(`[mock] ${name}`, data)
      return handler ? handler(data) : undefined
    })
  }

  // 返回上一页
  bridge.registerHandler('back', async () => {
    const wv = getWebview()
    if (wv && wv.canGoBack()) {
      wv.goBack()
    }
  })

  // 外部打开链接
  bridge.registerHandler('launchUrl', async (data) => {
    const url = extractUrl(data)
    if (url) {
      log(`[launchUrl] ${url}`)
      await window.bridge.openExternal(url)
    }
  })

  // 支付验证（mock 返回成功）
  bridge.registerHandler('goPayment', async (data) => {
    log('[goPayment]', data)
    return {
      action: 'VERIFY_SUCCESS',
      msg: '',
      data: {
        password: 'mock-pwd-md5',
        coinSymbol: '',
        chainSymbol: '',
        emailCode: '',
        googleCode: ''
      }
    }
  })

  // 上传图片（打开文件选择，返回本地路径）
  bridge.registerHandler('uploadImage', async (data) => {
    const path = await window.bridge.selectFile(['png', 'jpg', 'jpeg', 'gif', 'webp'])
    log(`[uploadImage] ${path ?? 'cancelled'}`, data)
    return { action: 'uploadImage', msg: '', data: path ?? '' }
  })

  // 选择图片上传
  bridge.registerHandler('selectImage', async (data) => {
    const path = await window.bridge.selectFile(['png', 'jpg', 'jpeg', 'gif', 'webp'])
    log(`[selectImage] ${path ?? 'cancelled'}`, data)
    return path ?? ''
  })

  // 选择文件
  bridge.registerHandler('selectFile', async (data) => {
    let allowList: string[] | undefined
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>
      if (Array.isArray(obj.allowList)) allowList = obj.allowList as string[]
    }
    const path = await window.bridge.selectFile(allowList)
    log(`[selectFile] ${path ?? 'cancelled'}`, data)
    return path
  })

  // 刷新 token
  bridge.registerHandler('refreshToken', async (data) => {
    log('[refreshToken]', data)
    const authData = buildAuthData(getConfig())
    deps.logWire?.({
      action: 'refreshToken',
      message: `H5 请求刷新凭证完全体`,
      level: 'info',
      detail: authData,
      wire: {
        channel: 'refreshToken',
        action: 'refreshToken',
        status: 200,
        response: { data: authData }
      }
    })
    return authData
  })

  // 获取认证信息
  bridge.registerHandler('getAuth', async (data) => {
    log('[getAuth]', data)
    const authData = buildAuthData(getConfig())
    deps.logWire?.({
      action: 'getAuth',
      message: `H5 获取认证凭证完全体 (userID: ${authData.userID || '未登录'})`,
      level: 'info',
      detail: authData,
      wire: {
        channel: 'getAuth',
        action: 'getAuth',
        status: 200,
        response: { data: authData }
      }
    })
    return authData
  })

  // 获取初始化数据
  bridge.registerHandler('getInitData', async () => {
    const config = getConfig()
    const payload = {
      userID: config.auth.userID,
      platform: resolvePlatform(config),
      groupID: config.auth.groupID
    }
    log('[getInitData]', payload)
    return { data: payload }
  })

  /**
   * 获取宿主 App 信息（品牌 + 版本）
   *
   * 与客户端约定：只回传 H5 需要的字段，后续增量追加，避免把设备/系统信息
   * 也塞进来造成两端字段口径漂移。H5 用 appName 区分品牌、version 做升级判断。
   */
  bridge.registerHandler('getAppInfo', async () => {
    const payload = { ...APP_INFO }
    log('[getAppInfo]', payload)
    // 兼容 H5 直接读 res.version / res.data.version 两种取值风格（与 getAuth 一致）
    return { ...payload, data: payload }
  })

  /**
   * 获取设备时区：Flutter 端 getDeviceTimeZone 返回的是偏移串（GMT+08:00），不是 IANA 名
   */
  bridge.registerHandler('getDeviceTimeZone', async () => {
    const timeZone = resolveTimeZoneOffset()
    log(`[getDeviceTimeZone] ${timeZone}`)
    return timeZone
  })

  /**
   * 获取 App 语言：Flutter 端返回下划线形式（zh_CN / en_US）
   */
  bridge.registerHandler('getAppLanguage', async () => {
    log(`[getAppLanguage] ${APP_LANGUAGE}`)
    return APP_LANGUAGE
  })

  // 跳转聊天（mock）
  mock('toChat')

  // 获取好友信息列表（mock 空列表）
  bridge.registerHandler('getFriendInfoList', async () => {
    log('[getFriendInfoList] -> []')
    return []
  })

  // 打开文件（mock）
  mock('openFile')

  // 保存数据（electron-store）
  bridge.registerHandler('saveData', async (data) => {
    if (data && typeof data === 'object') {
      const obj = data as { key?: unknown; value?: unknown }
      if (obj.key !== undefined) {
        await window.electronStore.set(String(obj.key), obj.value)
        log('[saveData]', { key: obj.key, value: obj.value })
        return true
      }
    }
    return false
  })

  // 读取数据（electron-store）
  bridge.registerHandler('getData', async (data) => {
    if (data && typeof data === 'object') {
      const obj = data as { key?: unknown }
      if (obj.key !== undefined) {
        const res = await window.electronStore.get(String(obj.key))
        log('[getData]', { key: obj.key, value: res })
        return res
      }
    }
    return null
  })

  // 页面跳转：ext=true 外部打开，否则 webview 内导航
  bridge.registerHandler('toPage', async (data) => {
    log('[toPage]', data)
    if (data && typeof data === 'object') {
      const obj = data as { url?: unknown; ext?: unknown }
      const url = typeof obj.url === 'string' ? obj.url : ''
      if (url) {
        if (obj.ext === true) {
          await window.bridge.openExternal(url)
        } else if (/^https?:\/\//i.test(url)) {
          getWebview()?.loadURL(url)
        }
        return true
      }
    }
    return false
  })

  const navigateH5Path = (path: string) => {
    const wv = getWebview()
    const current = wv?.getURL?.() || ''
    try {
      const u = new URL(current)
      const locale = u.pathname.match(/^\/([^/]+)\//)?.[1] || 'zh-hans'
      const next = new URL(`/${locale}${path.startsWith('/') ? path : `/${path}`}`, u.origin)
      if (u.searchParams.has('safeArea')) {
        next.searchParams.set('safeArea', u.searchParams.get('safeArea') || '0')
      }
      if (u.searchParams.has('vconsole')) {
        next.searchParams.set('vconsole', u.searchParams.get('vconsole') || 'yes')
      }
      const target = next.toString()
      log(`[navigate] ${path} -> ${target}`)
      wv?.loadURL(target)
      return true
    } catch (err) {
      log(`[navigate] 无法跳转 ${path}`, err)
      return false
    }
  }

  // 以下能力依赖 Flutter 内部路由/原生库，统一 mock
  mock('toScan')
  mock('toKeepBit')
  bridge.registerHandler('toUsStocks', async () => {
    return navigateH5Path('/financial/usStocks')
  })
  mock('toQuickCash')
  mock('startWs')
  mock('toVipAddress')
  mock('toCallCharges')
  mock('toContractEscrow')
  mock('toBankCard')
  mock('goKyc')
  mock('toServiceWebview')
  mock('refreshWalletCard')
  mock('settings')

  // HTTP 代理：主进程转发（模拟 Flutter JsBridgeProxy 代发，含自动鉴权与签名）
  bridge.registerHandler('proxy', async (rawPayload) => {
    // 兼容 payload 与 payload.data 嵌套格式
    const payload =
      rawPayload && typeof rawPayload === 'object' && 'data' in (rawPayload as any)
        ? (rawPayload as any).data
        : rawPayload

    const obj = (payload ?? {}) as {
      url?: unknown
      method?: unknown
      params?: Record<string, unknown>
      header?: Record<string, string>
      body?: unknown
    }
    if (typeof obj.url !== 'string' || !obj.url) return null
    const method = typeof obj.method === 'string' ? obj.method : 'POST'

    const startTime = Date.now()
    const res = (await window.bridge.httpRequest({
      url: obj.url,
      method,
      params: obj.params,
      header: obj.header,
      body: obj.body
    })) as HttpResponseResult

    const duration = res?.timeMs ?? (Date.now() - startTime)
    const finalMethod = (res?.requestInfo?.method || method).toUpperCase()
    const finalUrl = res?.requestInfo?.url || String(obj.url)
    const status = res?.status ?? 200

    // 记录 Electron 方向网络请求完全体（含完整 Headers、签名、Body 及响应）
    deps.logWire?.({
      action: `HTTP ${finalMethod}`,
      message: `${finalMethod} ${finalUrl} [${status} ${res?.statusText || ''}] (${duration}ms)`,
      level: status >= 400 ? (status >= 500 ? 'error' : 'warn') : 'info',
      detail: {
        request: {
          url: finalUrl,
          method: finalMethod,
          headers: res?.requestInfo?.headers,
          params: obj.params,
          body: res?.requestInfo?.body,
          rawBody: obj.body
        },
        response: {
          status,
          statusText: res?.statusText,
          headers: res?.headers,
          data: res?.data
        },
        durationMs: duration,
        sizeBytes: res?.sizeBytes
      },
      wire: {
        channel: 'proxy',
        action: `HTTP ${finalMethod}`,
        status,
        statusText: res?.statusText,
        durationMs: duration,
        sizeBytes: res?.sizeBytes,
        request: {
          url: finalUrl,
          method: finalMethod,
          headers: res?.requestInfo?.headers,
          params: obj.params,
          body: res?.requestInfo?.body,
          rawBody: obj.body
        },
        response: {
          status,
          statusText: res?.statusText,
          headers: res?.headers,
          data: res?.data
        }
      }
    })

    const authErr = checkAuthError(res?.status, res?.data)
    if (authErr) {
      log(`[proxy] 接口返回鉴权异常，强制退回登录: ${authErr}`, res?.data)
      deps.onAuthExpired?.(authErr)
    }

    log(`[proxy] ← ${finalMethod} ${finalUrl} [HTTP ${status}]`, res?.data)
    return res?.data
  })

  // 节点配置获取：还原 Flutter JsBridgeNodeConfig.fetch()
  bridge.registerHandler('getNodeConfig', async (data) => {
    log('[getNodeConfig] 获取当前环境节点配置', data)
    const result = await window.bridge.getNodeConfig()
    log('[getNodeConfig] 结果:', result)

    deps.logWire?.({
      action: 'getNodeConfig',
      message: `获取节点配置完全体: ${result?.data?.url || '默认节点'}`,
      level: 'info',
      detail: result,
      wire: {
        channel: 'getNodeConfig',
        action: 'getNodeConfig',
        status: 200,
        request: {
          url: result?.data?.url,
          extra: { input: data }
        },
        response: {
          status: 200,
          data: result?.data
        }
      }
    })

    return result
  })

  // 钱包 WebSocket 桥接：还原 Flutter JsBridgeWalletWs
  bridge.registerHandler('walletWs', async (data) => {
    log('[walletWs] 发送 WS 指令/消息', data)
    const result = await window.bridge.walletWs(data)

    deps.logWire?.({
      action: 'walletWs',
      message: `WS 指令发送完全体: ${typeof data === 'object' ? JSON.stringify(data) : String(data)}`,
      level: 'info',
      detail: { input: data, result },
      wire: {
        channel: 'walletWs',
        action: 'walletWs',
        status: 200,
        request: {
          body: data
        },
        response: {
          data: result
        }
      }
    })

    return result
  })

  // 监听来自主进程的美股行情 WS 推送（webview preload 已直接回调 H5，这里负责日志与连接器状态）
  if (window.bridge?.onUsStockWsMessage) {
    window.bridge.onUsStockWsMessage((event) => handleWsMessage(event))
    window.bridge.onUsStockWsStatus?.((status) => {
      handleWsStatus(status)
    })
  }

  // 首次进入时拉一次连接状态，连接器不至于显示为空白
  void window.bridge?.getUsStockWsStatus?.().then((status) => {
    if (status) log('[usStockWs] 当前连接状态', status)
  })

  // 监听来自主进程的 WS 推送，并回调 H5 的 onWalletMessage
  if (window.bridge?.onWalletWsMessage) {
    window.bridge.onWalletWsMessage((msg) => {
      log('[walletWs] 收到服务端推送 -> onWalletMessage', msg)
      deps.logWire?.({
        action: 'walletWs:recv',
        message: `收到服务端 WebSocket 推送完全体`,
        level: 'info',
        detail: msg,
        wire: {
          channel: 'walletWs',
          action: 'onWalletMessage', // 与 bridge-preload 的私有行情回调名保持一致（H5 注册的是 onStockListener）
          status: 200,
          response: {
            data: msg
          }
        }
      })
      void bridge.callHandler('onWalletMessage', msg)
    })
  }

  // 网页端请求去登录/重新登录
  bridge.registerHandler('toLogin', async (data) => {
    log('[toLogin] 网页请求跳转登录', data)
    deps.onAuthExpired?.('网页请求重新登录')
    return true
  })

  bridge.registerHandler('goLogin', async (data) => {
    log('[goLogin] 网页请求跳转登录', data)
    deps.onAuthExpired?.('网页请求重新登录')
    return true
  })

  // AppsFlyer 埋点（仅记录）
  bridge.registerHandler('appsflyerLogEvent', async (data) => {
    log('[appsflyerLogEvent]', data)
    return false
  })

  /**
   * 美股行情订阅：H5 下发 { op, args:[{instType, channel, instId}] }
   * 交给 webview preload → 主进程美股行情 WS，行情推送由 preload 回调 onUsStockMessage。
   */
  bridge.registerHandler('usStockPublic', async (rawPayload) => {
    const payload =
      rawPayload && typeof rawPayload === 'object' && 'data' in (rawPayload as any)
        ? (rawPayload as any).data
        : rawPayload
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {})
    const wsType = (payload && typeof payload === 'object' && (payload as any).wsType) || undefined
    ;(window as any).__USSTOCK_WS__?.send(text, wsType)
    log(`[usStockPublic] -> 美股行情 WS`, payload)
    addLog({
      source: 'ws',
      level: 'info',
      direction: 'out',
      action: 'h5:usStockPublic',
      message: `→ H5 下发订阅: ${text.slice(0, 300)}`,
      detail: payload
    })

    deps.logWire?.({
      action: 'usStockPublic',
      message: `美股订阅指令下发: ${text}`,
      level: 'info',
      detail: payload,
      wire: {
        channel: 'usStockWs',
        action: 'usStockPublic',
        status: 200,
        request: { body: payload },
        response: { data: { success: true } }
      }
    })
    return true
  })

  // 获取公钥
  bridge.registerHandler('pubKey', async () => {
    const key = getConfig().auth.pubKey || DEFAULT_PUB_KEY
    log(`[pubKey] return key (${key || 'empty'})`)
    return key
  })

  // 保存图片
  bridge.registerHandler('saveImage', async (data) => {
    log('[saveImage]', data)
    const obj = (data ?? {}) as {
      base64?: string
      blob?: number[]
      name?: string
    }
    if (obj.base64 || obj.blob) {
      await window.bridge.saveImage({
        base64: obj.base64,
        blob: obj.blob,
        name: obj.name
      })
    }
  })
}