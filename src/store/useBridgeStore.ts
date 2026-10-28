import { create } from 'zustand'
import { ipcPersist } from './ipcPersist'
import { defaultBridgeConfig, type AuthConfig, type BridgeConfig } from '../bridge/types'

interface BridgeState extends BridgeConfig {
  setConfig: <K extends keyof BridgeConfig>(key: K, value: BridgeConfig[K]) => void
  setAuth: <K extends keyof AuthConfig>(key: K, value: AuthConfig[K]) => void
  clearAuth: () => void
  /** 按环境保存一套凭据（测试/正式各存一份，切环境时整体换到 auth 上） */
  authByEnv?: Record<string, AuthConfig>
  setAuthForEnv: (env: string, auth: AuthConfig) => void
  /** 取出某个环境保存的凭据；没有则返回 undefined */
  getAuthForEnv: (env: string) => AuthConfig | undefined
  reset: () => void
}

/**
 * 桥接工具配置 store
 * 通过 ipcPersist 持久化到本地（默认 URL、设备、认证 mock 数据）
 */
export const useBridgeStore = create<BridgeState>()(
  ipcPersist<BridgeState>('bridge-config')(
    (set, get) => ({
      ...defaultBridgeConfig,
      setConfig: (key, value) => set({ [key]: value } as Partial<BridgeState>),
      setAuth: (key, value) =>
        set((state) => ({ auth: { ...state.auth, [key]: value } } as Partial<BridgeState>)),
      clearAuth: () => set({ auth: { ...defaultBridgeConfig.auth } } as Partial<BridgeState>),
      authByEnv: {},
      setAuthForEnv: (env, auth) =>
        set((state) => ({
          authByEnv: { ...(state.authByEnv || {}), [env]: { ...auth } }
        } as Partial<BridgeState>)),
      getAuthForEnv: (env) => (get() as BridgeState).authByEnv?.[env],
      reset: () => set({ ...defaultBridgeConfig })
    })
  )
)