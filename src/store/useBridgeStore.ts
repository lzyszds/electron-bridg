import { create } from 'zustand'
import { ipcPersist } from './ipcPersist'
import { defaultBridgeConfig, type AuthConfig, type BridgeConfig } from '../bridge/types'

interface BridgeState extends BridgeConfig {
  setConfig: <K extends keyof BridgeConfig>(key: K, value: BridgeConfig[K]) => void
  setAuth: <K extends keyof AuthConfig>(key: K, value: AuthConfig[K]) => void
  reset: () => void
}

/**
 * 桥接工具配置 store
 * 通过 ipcPersist 持久化到本地（默认 URL、设备、认证 mock 数据）
 */
export const useBridgeStore = create<BridgeState>()(
  ipcPersist<BridgeState>('bridge-config')(
    (set) => ({
      ...defaultBridgeConfig,
      setConfig: (key, value) => set({ [key]: value } as Partial<BridgeState>),
      setAuth: (key, value) =>
        set((state) => ({ auth: { ...state.auth, [key]: value } } as Partial<BridgeState>)),
      reset: () => set({ ...defaultBridgeConfig })
    })
  )
)