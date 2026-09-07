import type { StateCreator } from 'zustand'

type ElectronStore = typeof window.electronStore

/**
 * 将 store 中的数据序列化（处理不支持结构化克隆的值）
 */
function serialize<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value))
}

/**
 * Zustand 中间件：通过 Electron IPC 将 store 状态持久化到本地文件
 *
 * 工作流程：
 * 1. store 初始化时，从主进程的 electron-store 读取已持久化的状态进行水合
 * 2. 监听 store 变化，将新状态写入主进程的 electron-store
 * 3. 监听主进程广播的变更事件，实现多窗口状态同步
 *
 * @param key 在 electron-store 中存储的键名
 * @param skipHydrate 跳过初始水合（默认 false）
 */
export function ipcPersist<S extends object>(
  key: string,
  skipHydrate = false
) {
  return function (
    initializer: StateCreator<S, [], []>
  ): StateCreator<S, [], []> {
    return (set, get, api) => {
      const state = initializer(set, get, api)

      // 在非 Electron 环境下回退为普通 store（兼容 Web 预览）
      const storeApi: ElectronStore | undefined =
        typeof window !== 'undefined' ? window.electronStore : undefined

      if (!storeApi) {
        console.warn('[ipcPersist] window.electronStore 不可用，状态将不会持久化')
        return state
      }

      // 标记是否正在从 IPC 同步，避免循环写入
      let isApplyingRemoteChange = false

      // 订阅 store 变化，持久化到主进程
      const unsubscribe = api.subscribe((newState) => {
        if (isApplyingRemoteChange) return
        storeApi.set(key, serialize(newState)).catch((err) => {
          console.error(`[ipcPersist] 持久化失败 (${key}):`, err)
        })
      })

      // 监听主进程广播的变更（多窗口同步）
      const removeChangeListener = storeApi.onChange((changedKey, value) => {
        if (changedKey !== key) return
        if (!value) return
        isApplyingRemoteChange = true
        try {
          set(value as Partial<S>)
        } finally {
          isApplyingRemoteChange = false
        }
      })

      // 初始水合：从主进程读取已持久化的状态
      if (!skipHydrate) {
        storeApi
          .get<S>(key)
          .then((saved) => {
            if (saved && typeof saved === 'object') {
              isApplyingRemoteChange = true
              try {
                set(saved as Partial<S>)
              } finally {
                isApplyingRemoteChange = false
              }
            }
          })
          .catch((err) => {
            console.error(`[ipcPersist] 水合失败 (${key}):`, err)
          })
      }

      // 暴露清理方法（开发调试用）
      ;(api as unknown as { __ipcCleanup?: () => void }).__ipcCleanup = () => {
        unsubscribe()
        removeChangeListener()
      }

      return state
    }
  }
}
