import { contextBridge, ipcRenderer } from 'electron'
import { STORE_CHANNELS, type ElectronStoreApi } from '../shared/types'
import {
  BRIDGE_CHANNELS,
  type BridgeApi,
  type HttpRequestPayload,
  type SaveImagePayload
} from '../shared/bridge'

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
    ipcRenderer.invoke(BRIDGE_CHANNELS.SAVE_IMAGE, payload)
}

contextBridge.exposeInMainWorld('electronStore', electronStoreApi)
contextBridge.exposeInMainWorld('bridge', bridgeApi)