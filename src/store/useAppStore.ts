import { create } from 'zustand'
import { ipcPersist } from './ipcPersist'

interface UserSettings {
  username: string
  theme: 'light' | 'dark' | 'system'
  notifications: boolean
  language: string
}

interface AppState {
  settings: UserSettings
  setUsername: (name: string) => void
  setTheme: (theme: UserSettings['theme']) => void
  toggleNotifications: () => void
  reset: () => void
}

const defaultSettings: UserSettings = {
  username: '',
  theme: 'system',
  notifications: true,
  language: 'zh-CN'
}

/**
 * 应用设置 store
 * 使用 ipcPersist 中间件将 settings 持久化到本地
 * 重启应用后设置会自动恢复
 */
export const useAppStore = create<AppState>()(
  ipcPersist<AppState>('app-settings')(
    (set) => ({
      settings: { ...defaultSettings },
      setUsername: (name) =>
        set((state) => ({ settings: { ...state.settings, username: name } })),
      setTheme: (theme) =>
        set((state) => ({ settings: { ...state.settings, theme } })),
      toggleNotifications: () =>
        set((state) => ({
          settings: {
            ...state.settings,
            notifications: !state.settings.notifications
          }
        })),
      reset: () => set({ settings: { ...defaultSettings } })
    })
  )
)
