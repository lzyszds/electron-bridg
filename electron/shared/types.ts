/**
 * 共享类型定义 - 主进程与渲染进程共用
 */

/** electron-store IPC 通道名 */
export const STORE_CHANNELS = {
  GET: 'electron-store:get',
  SET: 'electron-store:set',
  DELETE: 'electron-store:delete',
  CLEAR: 'electron-store:clear',
  CHANGE: 'electron-store:change'
} as const

/** 暴露给渲染进程的 store API 类型 */
export interface ElectronStoreApi {
  get: <T = unknown>(key: string) => Promise<T | undefined>
  set: (key: string, value: unknown) => Promise<void>
  delete: (key: string) => Promise<void>
  clear: () => Promise<void>
  onChange: (callback: (key: string, value: unknown) => void) => () => void
}

declare global {
  interface Window {
    electronStore: ElectronStoreApi
  }
}
