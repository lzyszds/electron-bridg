import { useEffect, useState } from 'react'
import { useBridgeStore } from '../store/useBridgeStore'
import { DEVICE_PROFILES } from '../bridge/device-profiles'
import type { AuthConfig } from '../bridge/types'
import { H5_MODULES, BASE_URL_PRESETS, MODULE_CATEGORIES, buildModuleUrl } from '../config/modules'
import { cn } from '../lib/utils'
import { Settings, Globe, Server, ShieldCheck, X, Copy, Check } from 'lucide-react'

export interface AppConfig {
  envMode?: 'prod' | 'test'
  h5BaseUrl: string
  webviewUrl: string
  lastModuleId?: string
  locale: string
  withDebugParams: boolean
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
  const [activeTab, setActiveTab] = useState<'h5' | 'server' | 'bridge'>('h5')
  const [cfg, setCfg] = useState<AppConfig | null>(null)
  const [saving, setSaving] = useState(false)

  // 桥接 store 配置
  const bridgeConfig = useBridgeStore()
  const { auth } = bridgeConfig

  useEffect(() => {
    if (!open) return
    window.appConfig?.getConfig().then((c) => {
      setCfg({
        envMode: c.envMode || 'prod',
        h5BaseUrl: c.h5BaseUrl || 'https://module.qqlink.info',
        webviewUrl: c.webviewUrl || 'https://module.qqlink.info/zh-hans/financial/usStocks?safeArea=50&vconsole=yes',
        lastModuleId: c.lastModuleId || 'financial-usStocks',
        locale: c.locale || 'zh-hans',
        withDebugParams: c.withDebugParams ?? true,
        apiBaseUrl: c.apiBaseUrl || 'https://chat.qqlink.live/chat',
        walletUrl: c.walletUrl || 'https://api.qqlink.live',
        proxy: c.proxy || { enabled: true, url: 'http://127.0.0.1:7890' }
      })
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

  // 当环境/模块/语言变更时，辅助重新计算 URL
  const updateBaseUrl = (newBase: string) => {
    const selectedMod = H5_MODULES.find((m) => m.id === cfg.lastModuleId) || H5_MODULES[0]
    const nextUrl = buildModuleUrl(newBase, selectedMod.path, cfg.locale, cfg.withDebugParams)
    setCfg({ ...cfg, h5BaseUrl: newBase, webviewUrl: nextUrl })
  }

  const updateModule = (modId: string) => {
    const selectedMod = H5_MODULES.find((m) => m.id === modId) || H5_MODULES[0]
    const nextUrl = buildModuleUrl(cfg.h5BaseUrl, selectedMod.path, cfg.locale, cfg.withDebugParams)
    setCfg({ ...cfg, lastModuleId: modId, webviewUrl: nextUrl })
  }

  const updateLocale = (newLocale: string) => {
    const selectedMod = H5_MODULES.find((m) => m.id === cfg.lastModuleId) || H5_MODULES[0]
    const nextUrl = buildModuleUrl(cfg.h5BaseUrl, selectedMod.path, newLocale, cfg.withDebugParams)
    setCfg({ ...cfg, locale: newLocale, webviewUrl: nextUrl })
  }

  const updateDebugParams = (val: boolean) => {
    const selectedMod = H5_MODULES.find((m) => m.id === cfg.lastModuleId) || H5_MODULES[0]
    const nextUrl = buildModuleUrl(cfg.h5BaseUrl, selectedMod.path, cfg.locale, val)
    setCfg({ ...cfg, withDebugParams: val, webviewUrl: nextUrl })
  }

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
      envMode: 'prod',
      h5BaseUrl: 'https://module.qqlink.info',
      webviewUrl: 'https://module.qqlink.info/zh-hans/financial/usStocks?safeArea=50&vconsole=yes',
      lastModuleId: 'financial-usStocks',
      locale: 'zh-hans',
      withDebugParams: true,
      apiBaseUrl: 'https://chat.qqlink.live/chat',
      walletUrl: 'https://api.qqlink.live',
      proxy: {
        enabled: true,
        url: 'http://127.0.0.1:7890'
      }
    }
    setCfg(defaultCfg)
    bridgeConfig.reset()
  }

  const [copiedField, setCopiedField] = useState<string | null>(null)
  const handleCopyField = (key: string, val: string) => {
    if (!val) return
    navigator.clipboard.writeText(val)
    setCopiedField(key)
    setTimeout(() => setCopiedField(null), 1500)
  }

  const authFields: { key: keyof AuthConfig; label: string }[] = [
    { key: 'secretKey', label: 'Secret Key (全明文)' },
    { key: 'token', label: 'Token (全明文)' },
    { key: 'chatToken', label: 'Chat Token (全明文)' },
    { key: 'imToken', label: 'IM Token (全明文)' },
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
        className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">应用与环境配置</h2>
              <p className="text-[11px] text-zinc-400">配置 H5 访问域名、启动模块、服务节点与代理</p>
            </div>
          </div>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 选项卡切换 */}
        <div className="flex border-b border-zinc-100 dark:border-zinc-800 px-6 bg-zinc-50/50 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={() => setActiveTab('h5')}
            className={cn(
              'px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5',
              activeTab === 'h5'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            )}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>H5 域名与模块</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('server')}
            className={cn(
              'px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5',
              activeTab === 'server'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            )}
          >
            <Server className="w-3.5 h-3.5" />
            <span>服务节点与代理</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bridge')}
            className={cn(
              'px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5',
              activeTab === 'bridge'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            )}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>模拟凭证 (Mock Auth)</span>
          </button>
        </div>

        {/* 弹窗内容 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === 'h5' && (
            <div className="space-y-4">
              {/* 运行模式选择 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  运行模式切换 (环境与通信架构)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => {
                      const nextBase = 'https://module.qqlink.info'
                      const selectedMod = H5_MODULES.find((m) => m.id === cfg.lastModuleId) || H5_MODULES[0]
                      const nextUrl = buildModuleUrl(nextBase, selectedMod.path, cfg.locale, cfg.withDebugParams)
                      setCfg({
                        ...cfg,
                        envMode: 'prod',
                        h5BaseUrl: nextBase,
                        walletUrl: 'https://api.qqlink.live',
                        apiBaseUrl: 'https://chat.qqlink.live/chat',
                        webviewUrl: nextUrl
                      })
                    }}
                    className={cn(
                      'p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1',
                      cfg.envMode === 'prod' || !cfg.envMode
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200 shadow-xs'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <span>🚀 正式环境 (main)</span>
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                        .info
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      https://module.qqlink.info
                    </span>
                  </div>

                  <div
                    onClick={() => {
                      const nextBase = 'https://module.qqlink.buzz'
                      const selectedMod = H5_MODULES.find((m) => m.id === cfg.lastModuleId) || H5_MODULES[0]
                      const nextUrl = buildModuleUrl(nextBase, selectedMod.path, cfg.locale, cfg.withDebugParams)
                      setCfg({
                        ...cfg,
                        envMode: 'test',
                        h5BaseUrl: nextBase,
                        walletUrl: 'https://api.qqlink.buzz',
                        apiBaseUrl: 'https://chat.qqlink.buzz/chat',
                        webviewUrl: nextUrl
                      })
                    }}
                    className={cn(
                      'p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1',
                      cfg.envMode === 'test'
                        ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20 text-purple-900 dark:text-purple-200 shadow-xs'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <span>🧪 测试环境 (test SPA)</span>
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                        .buzz
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      https://module.qqlink.buzz (全桥接)
                    </span>
                  </div>
                </div>
              </div>

              {/* 基础域名 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    H5 基础服务器域名 (h5BaseUrl)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {BASE_URL_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => updateBaseUrl(p.value)}
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded border transition-all cursor-pointer',
                          cfg.h5BaseUrl === p.value
                            ? 'bg-blue-50 border-blue-300 text-blue-600 font-bold dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300'
                            : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400'
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs font-mono text-zinc-800 dark:text-zinc-200"
                  value={cfg.h5BaseUrl}
                  onChange={(e) => updateBaseUrl(e.target.value)}
                  placeholder="https://module.qqlink.info"
                />
              </div>

              {/* 语言与调试参数 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    语言路径前缀 (Locale)
                  </label>
                  <select
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none text-xs text-zinc-800 dark:text-zinc-200"
                    value={cfg.locale}
                    onChange={(e) => updateLocale(e.target.value)}
                  >
                    <option value="zh-hans">简体中文 (zh-hans)</option>
                    <option value="zh-hant">繁体中文 (zh-hant)</option>
                    <option value="en">English (en)</option>
                    <option value="">无前缀 (根路径)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    调试辅助参数 (safeArea & vConsole)
                  </label>
                  <label className="flex items-center gap-2 h-9 px-3 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.withDebugParams}
                      onChange={(e) => updateDebugParams(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-zinc-600 dark:text-zinc-300">
                      自动追加 safeArea=50 & vconsole=yes
                    </span>
                  </label>
                </div>
              </div>

              {/* 默认选择模块 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  默认启动模块
                </label>
                <select
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none text-xs text-zinc-800 dark:text-zinc-200 font-mono"
                  value={cfg.lastModuleId || 'financial-usStocks'}
                  onChange={(e) => updateModule(e.target.value)}
                >
                  {MODULE_CATEGORIES.map((cat) => (
                    <optgroup key={cat.id} label={cat.name}>
                      {H5_MODULES.filter((m) => m.category === cat.id).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.path})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* 当前完整生成的 URL */}
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    最终加载完整地址 (webviewUrl)
                  </label>
                  <span className="text-[10px] text-zinc-400">支持直接手动自定义微调</span>
                </div>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/60 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs font-mono text-blue-900 dark:text-blue-200"
                  value={cfg.webviewUrl}
                  onChange={(e) => setCfg({ ...cfg, webviewUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
          )}

          {activeTab === 'server' && (
            <div className="space-y-4">
              {/* 服务地址 */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    业务服务器地址 (apiBaseUrl)
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs font-mono text-zinc-800 dark:text-zinc-200"
                    value={cfg.apiBaseUrl}
                    onChange={(e) => setCfg({ ...cfg, apiBaseUrl: e.target.value })}
                    placeholder="https://chat.qqlink.live/chat"
                  />
                  <p className="text-[10px] text-zinc-400">
                    用于账号登录 API 接口（默认: https://chat.qqlink.live/chat）
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    钱包接口服务器 (walletUrl)
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs font-mono text-zinc-800 dark:text-zinc-200"
                    value={cfg.walletUrl}
                    onChange={(e) => setCfg({ ...cfg, walletUrl: e.target.value })}
                    placeholder="https://api.wallet8.top"
                  />
                </div>
              </div>

              {/* HTTP 代理 */}
              <div className="space-y-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      HTTP / SOCKS 代理转发
                    </h4>
                    <p className="text-[10px] text-zinc-400">
                      用于境内或开发网络访问跨境服务器
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.proxy.enabled}
                      onChange={(e) =>
                        setCfg({
                          ...cfg,
                          proxy: { ...cfg.proxy, enabled: e.target.checked }
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                  </label>
                </div>

                {cfg.proxy.enabled && (
                  <div className="space-y-1.5 animate-in fade-in duration-150">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      代理服务器地址
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs font-mono text-zinc-800 dark:text-zinc-200"
                      value={cfg.proxy.url}
                      onChange={(e) =>
                        setCfg({
                          ...cfg,
                          proxy: { ...cfg.proxy, url: e.target.value }
                        })
                      }
                      placeholder="http://127.0.0.1:7890"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'bridge' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  模拟设备平台
                </span>
                <div className="flex rounded-md border border-zinc-200 p-0.5 dark:border-zinc-700">
                  {(['auto', 'android', 'ios'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => bridgeConfig.setAuth('platform', p)}
                      className={cn(
                        'rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                        auth.platform === p
                          ? 'bg-blue-600 text-white'
                          : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400'
                      )}
                    >
                      {p === 'auto' ? '跟随设备' : p === 'ios' ? 'iOS' : 'Android'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {authFields.map((f) => {
                  const val = auth[f.key] || ''
                  return (
                    <div key={f.key} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {f.label}
                        </label>
                        {val && (
                          <button
                            type="button"
                            onClick={() => handleCopyField(f.key, val)}
                            className="text-[10px] text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer flex items-center gap-1 font-sans"
                            title={`复制 ${f.label}`}
                          >
                            {copiedField === f.key ? (
                              <>
                                <Check className="w-2.5 h-2.5 text-emerald-600" />
                                <span className="text-emerald-600">已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-2.5 h-2.5" />
                                <span>复制</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => bridgeConfig.setAuth(f.key, e.target.value)}
                        placeholder={`mock ${f.label}`}
                        className="flex h-8 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 text-xs font-mono text-zinc-700 placeholder:text-zinc-400 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 select-all"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 弹窗底部操作 */}
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            恢复默认配置
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-70 cursor-pointer"
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
