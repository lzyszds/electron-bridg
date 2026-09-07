import { contextBridge, ipcRenderer } from 'electron'
import { STORE_CHANNELS, type ElectronStoreApi } from '../shared/types'
import {
  BRIDGE_CHANNELS,
  type BridgeApi,
  type HttpRequestPayload,
  type SaveImagePayload
} from '../shared/bridge'

// ==================== 类型定义 ====================

interface LoginParams {
  email?: string
  password: string
  emailCode?: string
  googleCode?: string
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
  h5BaseUrl: string
  webviewUrl: string
  lastModuleId?: string
  locale: string
  withDebugParams: boolean
  apiBaseUrl: string
  walletUrl: string
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

  httpRequest: (payload: HttpRequestPayload): Promise<unknown> =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.HTTP_REQUEST, payload),

  selectFile: (allowList?: string[]): Promise<string | null> =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.SELECT_FILE, allowList),

  saveImage: (payload: SaveImagePayload): Promise<void> =>
    ipcRenderer.invoke(BRIDGE_CHANNELS.SAVE_IMAGE, payload),

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

  getToken: (): Promise<string> =>
    ipcRenderer.invoke('auth:getToken'),

  isLoggedIn: (): Promise<boolean> =>
    ipcRenderer.invoke('auth:isLoggedIn'),

  getAuthInfo: (): Promise<AuthInfo> =>
    ipcRenderer.invoke('auth:getInfo'),

  getAuthTokens: (): Promise<AuthTokens> =>
    ipcRenderer.invoke('auth:getTokens'),

  getUserID: (): Promise<string> =>
    ipcRenderer.invoke('auth:getUserID'),

  logout: (): void => {
    ipcRenderer.send('auth:logout')
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

contextBridge.exposeInMainWorld('electronStore', electronStoreApi)
contextBridge.exposeInMainWorld('bridge', bridgeApi)
contextBridge.exposeInMainWorld('auth', authApi)
contextBridge.exposeInMainWorld('appConfig', configApi)