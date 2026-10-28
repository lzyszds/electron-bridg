import { contextBridge, ipcRenderer } from 'electron'
import { STORE_CHANNELS, type ElectronStoreApi } from '../shared/types'
import type { WsMessageEvent, WsStatusEvent } from '../shared/ws'

// 只做 type import，避免 shared/ws 运行时常量被拆进 preload 的 chunks/ 共享包
const WS_CHANNELS = {
  MESSAGE: 'usstock-ws:message',
  STATUS: 'usstock-ws:status',
  GET_STATUS: 'usstock-ws:get-status'
} as const
import {
  BRIDGE_CHANNELS,
  type BridgeApi,
  type HttpRequestPayload,
  type HttpResponseResult,
  type SaveImagePayload
} from '../shared/bridge'

// ==================== 类型定义 ====================

interface LoginParams {
  email?: string
  password: string
  emailCode?: string
  googleCode?: string
  envMode?: string
}

interface LoginResult {
  success: boolean
  data?: {
    token: string
    refreshToken: string
    expireTime: number
    userID: string
  }
  errMsg?: string
  errCode?: number
  errDlt?: string
  /** errCode 为 20016 时服务端要求的安全验证 */
  verify?: { email: string; verifiys: string[] }
}

interface AuthInfo {
  token: string
  refreshToken: string
  expireTime: number
  userID: string
  loginTime: string
  walletToken: string
  secretKey: string
  kbitToken: string
  chatToken: string
}

interface AuthTokens {
  token: string
  secretKey: string
  kbitToken: string
  chatToken: string
}

interface AppConfig {
  envMode?: 'prod' | 'test'
  h5BaseUrl: string
  webviewUrl: string
  lastModuleId?: string
  locale: string
  withDebugParams: boolean
  apiBaseUrl: string
  walletUrl: string
  usStockWsUrl?: string
  usStockWsApiKey?: string
  proxy: { enabled: boolean; url: string }
}

// ==================== electron-store API ====================

const electronStoreApi: ElectronStoreApi = {
  get: <T = unknown>(key: string): Promise<T | undefined> =>
    ipcRenderer.invoke(STORE_CHANNELS.GET, key),

  set: (key: string, value: unknown): Promise<void> =>
    ipcRenderer.invoke(STORE_CHANNELS.SET, key, value),

  delete: (key: string): Promise<void> =>
    ipcRenderer.invoke(STORE_CHANNELS.DELETE, key),

  clear: (): Promise<void> =>
    ipcRenderer.invoke(STORE_CHANNELS.CLEAR),

  onChange: (callback: (key: string, value: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, key: string, value: unknown) => {
      callback(key, value)
    }
    ipcRenderer.on(STORE_CHANNELS.CHANGE, listener)
    return () => {
      ipcRenderer.removeListener(STORE_CHANNELS.CHANGE, listener)
    }
  }
}

// ==================== Bridge API ====================

const bridgeApi: BridgeApi = {
  getPreloadPath: (): Promise<string> =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.GET_PRELOAD_PATH),

  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.OPEN_EXTERNAL, url),

  httpRequest: (payload: HttpRequestPayload): Promise<HttpResponseResult> =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.HTTP_REQUEST, payload),

  selectFile: (allowList?: string[]): Promise<string | null> =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.SELECT_FILE, allowList),

  saveImage: (payload: SaveImagePayload): Promise<void> =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.SAVE_IMAGE, payload),

  getNodeConfig: () =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.GET_NODE_CONFIG),

  refreshWalletSession: () =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.WALLET_SESSION_REFRESH),

  walletWs: (data: unknown) =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.WALLET_WS, data),

  onWalletWsMessage: (callback: (msg: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, msg: unknown) => callback(msg)
    ipcRenderer.on(BRIDGE_CHANNELS.WALLET_WS_MESSAGE, listener)
    return () => {
      ipcRenderer.removeListener(BRIDGE_CHANNELS.WALLET_WS_MESSAGE, listener)
    }
  },

  onUsStockWsMessage: (callback: (event: WsMessageEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: WsMessageEvent) => callback(data)
    ipcRenderer.on(WS_CHANNELS.MESSAGE, listener)
    return () => {
      ipcRenderer.removeListener(WS_CHANNELS.MESSAGE, listener)
    }
  },

  onUsStockWsStatus: (callback: (event: WsStatusEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: WsStatusEvent) => callback(data)
    ipcRenderer.on(WS_CHANNELS.STATUS, listener)
    return () => {
      ipcRenderer.removeListener(WS_CHANNELS.STATUS, listener)
    }
  },

  getUsStockWsStatus: () => ipcRenderer.invoke(WS_CHANNELS.GET_STATUS),

  toggleDevTools: (): void => {
    ipcRenderer.send('devtools:toggleMain')
  },

  toggleWebviewDevTools: (): void => {
    ipcRenderer.send('devtools:toggleWebview')
  }
}

// ==================== Auth API ====================

const authApi = {
  login: (params: LoginParams): Promise<LoginResult> =>
    ipcRenderer.invoke('auth:login', params),

  sendEmailCode: (params: { email: string; codeType: number }): Promise<{ success: boolean; errMsg?: string }> =>
    ipcRenderer.invoke('auth:sendEmailCode', params),

  getToken: (env?: string): Promise<string> =>
    ipcRenderer.invoke('auth:getToken', env),

  isLoggedIn: (env?: string): Promise<boolean> =>
    ipcRenderer.invoke('auth:isLoggedIn', env),

  getAuthInfo: (env?: string): Promise<AuthInfo> =>
    ipcRenderer.invoke('auth:getInfo', env),

  getAuthTokens: (env?: string): Promise<AuthTokens> =>
    ipcRenderer.invoke('auth:getTokens', env),

  getUserID: (env?: string): Promise<string> =>
    ipcRenderer.invoke('auth:getUserID', env),

  logout: (env?: string): void => {
    ipcRenderer.send('auth:logout', env)
  }
}

// ==================== Config API ====================

const configApi = {
  getConfig: (): Promise<AppConfig> =>
    ipcRenderer.invoke('config:get'),

  setConfig: (patch: Partial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke('config:set', patch),

  onConfigChanged: (callback: (cfg: AppConfig) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, cfg: AppConfig) => callback(cfg)
    ipcRenderer.on('config:changed', handler)
    return () => ipcRenderer.removeListener('config:changed', handler)
  }
}

// ==================== 暴露到渲染进程 ====================
// 必须在模块顶层直接执行：preload 只会被执行一次，导出函数不会被 Electron 调用。
// 曾经把这里包进 export default 函数，导致 out/preload/index.cjs 只有导出、没有调用，
// window.auth / bridge / electronStore / appConfig 全部缺失。
// 文件末尾另有一个占位导出，让入口模块被视为"有导出"，防止被 Rollup 摇树清空。
try {
  contextBridge.exposeInMainWorld('electronStore', electronStoreApi)
} catch (err) {
  console.error('[preload] 暴露 electronStore 失败:', err)
}
try {
  contextBridge.exposeInMainWorld('bridge', bridgeApi)
} catch (err) {
  console.error('[preload] 暴露 bridge 失败:', err)
}
try {
  contextBridge.exposeInMainWorld('auth', authApi)
} catch (err) {
  console.error('[preload] 暴露 auth 失败:', err)
}
try {
  contextBridge.exposeInMainWorld('appConfig', configApi)
} catch (err) {
  console.error('[preload] 暴露 appConfig 失败:', err)
}

// 占位导出（值为空对象，不参与任何逻辑），仅用于让入口模块被视为"有导出"
export const PRELOAD_READY = true
void PRELOAD_READY