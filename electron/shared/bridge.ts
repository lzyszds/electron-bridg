/**
 * WebView 桥接相关的共享类型与通道定义
 */

/** 桥接相关 IPC 通道 */
export const BRIDGE_CHANNELS = {
  GET_PRELOAD_PATH: 'bridge:get-preload-path',
  OPEN_EXTERNAL: 'bridge:open-external',
  HTTP_REQUEST: 'bridge:http-request',
  SELECT_FILE: 'bridge:select-file',
  SAVE_IMAGE: 'bridge:save-image'
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

/** 通过 contextBridge 暴露给主窗口渲染进程的桥接 API */
export interface BridgeApi {
  getPreloadPath: () => Promise<string>
  openExternal: (url: string) => Promise<void>
  httpRequest: (payload: HttpRequestPayload) => Promise<unknown>
  selectFile: (allowList?: string[]) => Promise<string | null>
  saveImage: (payload: SaveImagePayload) => Promise<void>
  toggleDevTools?: () => void
  toggleWebviewDevTools?: () => void
}

declare global {
  interface Window {
    bridge: BridgeApi
  }
}