import { useEffect, useState } from 'react'
import { useBridgeStore } from '../store/useBridgeStore'
import { DEVICE_PROFILES } from '../bridge/device-profiles'
import type { AuthConfig } from '../bridge/types'
import { cn } from '../lib/utils'

export interface AppConfig {
  webviewUrl: string
  apiBaseUrl: string
  walletUrl: string
  proxy: {
    enabled: boolean
    url: string
  }
}

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  onSaved?: (cfg: AppConfig) => void
}

export function SettingsDialog({ open, onClose, onSaved }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<'app' | 'bridge'>('app')
  const [cfg, setCfg] = useState<AppConfig | null>(null)
  const [saving, setSaving] = useState(false)

  // 桥接 store 配置
  const bridgeConfig = useBridgeStore()
  const { auth } = bridgeConfig

  useEffect(() => {
    if (!open) return
    window.appConfig?.getConfig().then((c) => {
      setCfg(c)
    })
  }, [open])

  // ESC 快捷键关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !cfg) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      const saved = await window.appConfig?.setConfig(cfg)
      if (saved) {
        setCfg(saved)
        onSaved?.(saved)
      }
      onClose()
    } catch (e) {
      console.error('[SettingsDialog] 保存配置失败:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleResetDefaults = async () => {
    if (!confirm('确定要恢复默认设置吗？')) return
    const defaultCfg: AppConfig = {
      webviewUrl: 'https://test.qqlink.info/zh-hans/financial/usStocks?safeArea=50&vconsole=yes',
      apiBaseUrl: 'https://chat.qqlink.live/chat',
      walletUrl: 'https://api.wallet8.top',
      proxy: {
        enabled: true,
        url: 'http://127.0.0.1:7890'
      }
    }
    setCfg(defaultCfg)
    bridgeConfig.reset()
  }

  const authFields: { key: keyof AuthConfig; label: string; type?: 'text' | 'password' }[] = [
    { key: 'secretKey', label: 'Secret Key', type: 'password' },
    { key: 'token', label: 'Token', type: 'password' },
    { key: 'chatToken', label: 'Chat Token', type: 'password' },
    { key: 'imToken', label: 'IM Token', type: 'password' },
    { key: 'userID', label: 'User ID' },
    { key: 'groupID', label: 'Group ID' },
    { key: 'pubKey', label: 'PubKey (RSA)' }
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚙️</span>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">应用与桥接设置</h2>
          </div>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* 选项卡切换 */}
        <div className="flex border-b border-zinc-100 dark:border-zinc-800 px-6 bg-zinc-50/50 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={() => setActiveTab('app')}
            className={cn(
              'px-4 py-2.5 text-xs font-semibold border-b-2 transition-all',
              activeTab === 'app'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            )}
          >
            服务与网络配置 (本地存储)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bridge')}
            className={cn(
              'px-4 py-2.5 text-xs font-semibold border-b-2 transition-all',
              activeTab === 'bridge'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            )}
          >
            H5 页面与 Mock 认证
          </button>
        </div>

        {/* 弹窗内容 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'app' ? (
            <>
              {/* 服务地址 */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  服务地址配置
                </h3>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      业务服务器地址 (apiBaseUrl，登录与业务 API)
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs font-mono text-zinc-800 dark:text-zinc-200"
                      value={cfg.apiBaseUrl}
                      onChange={(e) => setCfg({ ...cfg, apiBaseUrl: e.target.value })}
                      placeholder="https://chat.qqlink.live/chat"
                    />
                    <p className="text-[10px] text-zinc-400">
                      默认: https://chat.qqlink.live/chat（登录接口动态读取此配置）
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      钱包接口地址 (walletUrl，发送验证码等)
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs font-mono text-zinc-800 dark:text-zinc-200"
                      value={cfg.walletUrl}
                      onChange={(e) => setCfg({ ...cfg, walletUrl: e.target.value })}
                      placeholder="https://api.wallet8.top"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      默认 WebView 加载地址 (webviewUrl)
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs font-mono text-zinc-800 dark:text-zinc-200"
                      value={cfg.webviewUrl}
                      onChange={(e) => setCfg({ ...cfg, webviewUrl: e.target.value })}
                      placeholder="https://h5.example.com"
                    />
                  </div>
                </div>
              </section>

              {/* HTTP 代理 */}
              <section className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      HTTP / HTTPS 代理
                    </h3>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      用于接口请求 (axios) 网络代理，保存后立即生效
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={cfg.proxy.enabled}
                      onChange={(e) =>
                        setCfg({ ...cfg, proxy: { ...cfg.proxy, enabled: e.target.checked } })
                      }
                    />
                    <div className="w-10 h-5 bg-zinc-200 peer-focus:outline-none rounded-full dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    代理地址
                  </label>
                  <input
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-xs font-mono text-zinc-800 dark:text-zinc-200"
                    placeholder="http://127.0.0.1:7890"
                    value={cfg.proxy.url}
                    onChange={(e) => setCfg({ ...cfg, proxy: { ...cfg.proxy, url: e.target.value } })}
                  />
                </div>
              </section>

              {/* 本地存储说明 */}
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/50">
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <span>💾</span>
                  <span>所有修改将自动保存在系统本地文件 <code>app-config.json</code> 中，重启依然有效。</span>
                </p>
              </div>
            </>
          ) : (
            <>
              {/* 设备与 UA */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  设备与容器配置
                </h3>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      设备型号
                    </label>
                    <select
                      value={bridgeConfig.deviceId}
                      onChange={(e) => bridgeConfig.setConfig('deviceId', e.target.value)}
                      className="flex h-8 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-xs text-zinc-700 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                    >
                      {DEVICE_PROFILES.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} · {d.width}×{d.height}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      自定义 UA（留空使用设备默认 UA）
                    </label>
                    <input
                      type="text"
                      value={bridgeConfig.customUserAgent}
                      onChange={(e) => bridgeConfig.setConfig('customUserAgent', e.target.value)}
                      placeholder="留空使用设备默认 UA"
                      className="flex h-8 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-mono text-zinc-700 placeholder:text-zinc-400 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                    />
                  </div>
                </div>
              </section>

              {/* Mock 认证数据 */}
              <section className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Mock 认证数据
                  </h3>
                  <div className="flex gap-1">
                    {(['auto', 'ios', 'android'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => bridgeConfig.setAuth('platform', p)}
                        className={cn(
                          'rounded border px-2 py-0.5 text-[11px] transition-colors',
                          auth.platform === p
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                        )}
                      >
                        {p === 'auto' ? '自动' : p === 'ios' ? 'iOS' : 'Android'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {authFields.map((f) => (
                    <div key={f.key} className="space-y-1">
                      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{f.label}</label>
                      <input
                        type={f.type || 'text'}
                        value={auth[f.key]}
                        onChange={(e) => bridgeConfig.setAuth(f.key, e.target.value)}
                        placeholder={`mock ${f.label}`}
                        className="flex h-8 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 text-xs font-mono text-zinc-700 placeholder:text-zinc-400 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                      />
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        {/* 弹窗底部操作 */}
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            恢复默认配置
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-70"
              onClick={handleSave}
              disabled={saving}
            >
              {saving && (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {saving ? '正在保存...' : '保 存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
