/**
 * WebView 桥接相关的共享类型与通道定义
 */

/** 桥接相关 IPC 通道 */
export const BRIDGE_CHANNELS = {
  GET_PRELOAD_PATH: 'bridge:get-preload-path',
  OPEN_EXTERNAL: 'bridge:open-external',
  HTTP_REQUEST: 'bridge:http-request',
  SELECT_FILE: 'bridge:select-file',
  SAVE_IMAGE: 'bridge:save-image',
  GET_NODE_CONFIG: 'bridge:get-node-config',
  WALLET_WS: 'bridge:wallet-ws',
  WALLET_WS_MESSAGE: 'bridge:wallet-ws-message'
} as const

/** proxy handler 的请求载荷 */
export interface HttpRequestPayload {
  url: string
  method: string
  params?: Record<string, unknown>
  header?: Record<string, string>
  body?: unknown
}

/** saveImage handler 的请求载荷 */
export interface SaveImagePayload {
  base64?: string
  blob?: number[]
  name?: string
}

export interface NodeConfigResult {
  data: {
    url: string
    content: string
  }
}

export interface HttpResponseResult {
  status: number
  statusText?: string
  data: unknown
  headers?: Record<string, string>
  timeMs?: number
  sizeBytes?: number
  requestInfo?: {
    url: string
    method: string
    headers: Record<string, string>
    body?: unknown
  }
}

/** 通过 contextBridge 暴露给主窗口渲染进程的桥接 API */
export interface BridgeApi {
  getPreloadPath: () => Promise<string>
  openExternal: (url: string) => Promise<void>
  httpRequest: (payload: HttpRequestPayload) => Promise<HttpResponseResult>
  selectFile: (allowList?: string[]) => Promise<string | null>
  saveImage: (payload: SaveImagePayload) => Promise<void>
  getNodeConfig: () => Promise<NodeConfigResult>
  walletWs: (data: unknown) => Promise<unknown>
  onWalletWsMessage?: (callback: (msg: unknown) => void) => () => void
  toggleDevTools?: () => void
  toggleWebviewDevTools?: () => void
}

declare global {
  interface Window {
    bridge: BridgeApi
  }
}