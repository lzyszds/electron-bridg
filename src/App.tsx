import { useCallback, useEffect, useRef, useState, Fragment } from 'react'
import type { WebviewTag } from 'electron'
import { useBridgeStore } from './store/useBridgeStore'
import { useLogStore } from './store/useLogStore'
import { getDeviceProfile, DEVICE_PROFILES } from './bridge/device-profiles'
import { JsBridge, type JsBridgeEvent } from './bridge/jsbridge'
import { registerHandlers } from './bridge/handlers'
import { webviewBridgeSdk, webviewPolyfills } from './bridge/sdk'
import { LogPanel } from './components/LogPanel'
import { SettingsDialog, type AppConfig } from './components/SettingsDialog'
import {
  H5_MODULES,
  MODULE_CATEGORIES,
  buildModuleUrl,
  extractModulePath,
  ENV_MODES,
  type H5Module,
  type EnvMode
} from './config/modules'
import { ModuleIcon } from './components/ModuleIcon'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger
} from './components/ui/select'
import LoginPage from './components/LoginPage'
import { EnvSwitchConfirmDialog } from './components/EnvSwitchConfirmDialog'
import {
  Zap,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Copy,
  Check,
  Terminal,
  Settings,
  Power,
  Link2,
  Code,
  Bug,
  Smartphone,
  Globe,
  Boxes,
  CornerDownLeft
} from 'lucide-react'
import { cn } from './lib/utils'

type PageState = 'checking' | 'login' | 'main'

function App() {
  const [pageState, setPageState] = useState<PageState>('checking')
  const [userID, setUserID] = useState('')

  const webviewRef = useRef<WebviewTag | null>(null)
  const bridgeRef = useRef<JsBridge | null>(null)
  const preloadPathRef = useRef<string>('')

  const [url, setUrl] = useState('')
  const [inputUrl, setInputUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [bridgeReady, setBridgeReady] = useState(false)

  // 模块切换与环境记忆状态
  const [envMode, setEnvMode] = useState<EnvMode>('prod')
  const [currentModuleId, setCurrentModuleId] = useState<string>('financial-usStocks')
  const [currentBaseUrl, setCurrentBaseUrl] = useState<string>('https://module.qqlink.info')
  const [locale, setLocale] = useState<string>('zh-hans')
  const [withDebugParams, setWithDebugParams] = useState<boolean>(true)
  const [showLogPanel, setShowLogPanel] = useState<boolean>(true)
  const [copied, setCopied] = useState<boolean>(false)
  const [zoom, setZoom] = useState<number>(0.82)
  const [useSafeArea, setUseSafeArea] = useState<boolean>(true)

  const handleCopyUrl = useCallback(() => {
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [url])

  const bridgeConfig = useBridgeStore()
  const addLog = useLogStore((s) => s.addLog)

  const device = getDeviceProfile(bridgeConfig.deviceId)
  const userAgent = bridgeConfig.customUserAgent || device.userAgent

  // ===== 同步 Token 并恢复上次访问的模块与路径 =====
  const syncTokensAndEnterMain = useCallback(
    async (uid: string, curEnv?: EnvMode) => {
      const mode = curEnv || envMode
      setUserID(uid)
      try {
        const tokens = await window.auth.getAuthTokens(mode)
        useBridgeStore.getState().setAuth('token', tokens.token)
        useBridgeStore.getState().setAuth('secretKey', tokens.secretKey)
        useBridgeStore.getState().setAuth('imToken', tokens.kbitToken)
        useBridgeStore.getState().setAuth('chatToken', tokens.chatToken)
        useBridgeStore.getState().setAuth('userID', uid)
        addLog({
          source: 'system',
          level: 'system',
          message: `已载入【${ENV_MODES[mode].label}】账号凭据 (userID: ${uid})`
        })
      } catch (e) {
        console.warn('[App] 注入 token 异常:', e)
      }

      let targetEnv: EnvMode = mode
      let targetBase = ENV_MODES[mode].h5BaseUrl
      let targetLocale = 'zh-hans'
      let targetDebug = true
      let targetModId = 'financial-usStocks'
      let targetUrl = ''

      try {
        const cfg = await window.appConfig.getConfig()
        if (cfg.locale) targetLocale = cfg.locale
        if (cfg.withDebugParams !== undefined) targetDebug = cfg.withDebugParams
        if (cfg.lastModuleId) targetModId = cfg.lastModuleId
        if (cfg.webviewUrl) targetUrl = cfg.webviewUrl
      } catch {
        // 忽略
      }

      const localLastUrl = localStorage.getItem('qqlink_last_visited_url')
      const localLastMod = localStorage.getItem('qqlink_last_module_id')
      if (localLastUrl) targetUrl = localLastUrl
      if (localLastMod) targetModId = localLastMod

      setEnvMode(targetEnv)
      setCurrentBaseUrl(targetBase)
      setLocale(targetLocale)
      setWithDebugParams(targetDebug)
      setCurrentModuleId(targetModId)

      // 若无有效目标地址，则拼接该模块默认地址
      if (!targetUrl) {
        const mod = H5_MODULES.find((m) => m.id === targetModId) || H5_MODULES[0]
        targetUrl = buildModuleUrl(targetBase, mod.path, targetLocale, targetDebug)
      }

      setUrl(targetUrl)
      setInputUrl(targetUrl)
      setPageState('main')
    },
    [envMode, addLog]
  )

  // 待切换的目标环境模式（非 null 时唤起二次确认提醒弹窗）
  const [pendingEnvMode, setPendingEnvMode] = useState<EnvMode | null>(null)

  // ===== 用户请求切换环境模式：唤起二次确认弹窗 =====
  const handleRequestSwitchEnvMode = useCallback(
    (newMode: EnvMode) => {
      if (newMode === envMode) return
      setPendingEnvMode(newMode)
    },
    [envMode]
  )

  // ===== 二次确认提醒后：确认切换环境并强制退回登录页 =====
  const handleConfirmSwitchEnvMode = useCallback(async () => {
    if (!pendingEnvMode) return
    const targetMode = pendingEnvMode
    setPendingEnvMode(null)

    const preset = ENV_MODES[targetMode]
    setEnvMode(targetMode)
    setCurrentBaseUrl(preset.h5BaseUrl)
    localStorage.setItem('qqlink_env_mode', targetMode)

    // 1. 同步更新主进程环境配置（BaseURL、接口地址与安全拦截白名单）
    try {
      await window.appConfig?.setConfig({
        envMode: targetMode,
        h5BaseUrl: preset.h5BaseUrl,
        walletUrl: preset.walletUrl,
        apiBaseUrl: preset.apiBaseUrl
      })
    } catch {
      // 忽略
    }

    // 2. 清理当前内存中的鉴权凭证
    useBridgeStore.getState().clearAuth()

    addLog({
      source: 'system',
      level: 'system',
      message: `已切换至【${preset.label}】。因两个环境账号体系独立不互通，已强制退出至登录页，请登录该环境账号。`
    })

    // 3. 强制退回登录页
    setPageState('login')
  }, [pendingEnvMode, addLog])

  // ===== 启动时检查本地是否存储着有效 Token =====
  useEffect(() => {
    const checkAuth = async () => {
      const auth = window.auth
      if (!auth) {
        setPageState('login')
        return
      }
      try {
        const curEnv = (localStorage.getItem('qqlink_env_mode') as EnvMode) || 'prod'
        setEnvMode(curEnv)
        const loggedIn = await auth.isLoggedIn(curEnv)
        if (loggedIn) {
          const info = await auth.getAuthInfo(curEnv)
          await syncTokensAndEnterMain(info.userID, curEnv)
        } else {
          setPageState('login')
        }
      } catch {
        setPageState('login')
      }
    }
    checkAuth()
  }, [syncTokensAndEnterMain])

  // ===== 获取 webview preload 路径 =====
  useEffect(() => {
    window.bridge?.getPreloadPath().then((p) => {
      preloadPathRef.current = p
    })
  }, [])

  // ===== 登录成功后进入主界面 =====
  const handleLoginSuccess = async (data: { token: string; userID: string }, fromEnv?: EnvMode) => {
    const curEnv = fromEnv || envMode
    setEnvMode(curEnv)
    await syncTokensAndEnterMain(data.userID, curEnv)
  }

  // ===== 退出登录 =====
  const handleLogout = useCallback(() => {
    window.auth?.logout(envMode)
    useBridgeStore.getState().setAuth('token', '')
    useBridgeStore.getState().setAuth('secretKey', '')
    useBridgeStore.getState().setAuth('imToken', '')
    useBridgeStore.getState().setAuth('chatToken', '')
    useBridgeStore.getState().setAuth('userID', '')
    setUserID('')
    setUrl('')
    setInputUrl('')
    setPageState('login')
  }, [envMode])

  // ===== Token 错误/过期强制退出登录 =====
  const handleAuthExpired = useCallback(
    (reason?: string) => {
      console.warn('[App] 登录已失效或过期:', reason)
      addLog({
        source: 'system',
        level: 'warn',
        message: `Token 失效或已过期，强制退出登录: ${reason || '请重新登录'}`
      })
      handleLogout()
      alert(reason ? `登录失效 (${reason})，请重新登录` : '登录已过期或 Token 失效，请重新登录')
    },
    [addLog, handleLogout]
  )

  // ===== 切换选中的 H5 模块并持久化记忆 =====
  const handleSelectModule = useCallback(
    async (mod: H5Module) => {
      setCurrentModuleId(mod.id)
      localStorage.setItem('qqlink_last_module_id', mod.id)

      const fullUrl = buildModuleUrl(currentBaseUrl, mod.path, locale, withDebugParams)
      setUrl(fullUrl)
      setInputUrl(fullUrl)
      localStorage.setItem('qqlink_last_visited_url', fullUrl)

      try {
        await window.appConfig?.setConfig({
          lastModuleId: mod.id,
          webviewUrl: fullUrl
        })
      } catch {
        // 忽略
      }

      try {
        webviewRef.current?.loadURL(fullUrl)
      } catch {
        // 忽略未就绪
      }

      addLog({
        source: 'system',
        level: 'info',
        message: `切换至模块: ${mod.name} (${mod.path})`
      })
    },
    [currentBaseUrl, locale, withDebugParams, addLog]
  )

  // ===== 地址栏手动跳转 =====
  const handleNavigate = useCallback(() => {
    const target = inputUrl.trim()
    if (!target) return
    let finalUrl = target
    if (!/^https?:\/\//i.test(target)) {
      finalUrl = `https://${target}`
    }
    setUrl(finalUrl)
    setInputUrl(finalUrl)
    localStorage.setItem('qqlink_last_visited_url', finalUrl)
    window.appConfig?.setConfig({ webviewUrl: finalUrl }).catch(() => {})

    // 匹配并同步左侧选中的模块
    for (const mod of H5_MODULES) {
      if (finalUrl.includes(mod.path)) {
        setCurrentModuleId(mod.id)
        localStorage.setItem('qqlink_last_module_id', mod.id)
        break
      }
    }

    try {
      webviewRef.current?.loadURL(finalUrl)
    } catch {
      // 忽略未就绪，由 src 属性响应式加载
    }
  }, [inputUrl])

  const handleBack = () => webviewRef.current?.goBack()
  const handleForward = () => webviewRef.current?.goForward()
  const handleRefresh = () => webviewRef.current?.reload()

  // ===== 初始化 JsBridge（仅在 main 页面） =====
  useEffect(() => {
    if (pageState !== 'main') return
    const wv = webviewRef.current
    if (!wv) return

    const bridge = new JsBridge({
      executor: (script: string) => wv.executeJavaScript(script),
      onEvent: (event: JsBridgeEvent) => {
        addLog({
          source: 'bridge',
          level: 'info',
          message: `${event.action}`,
          detail: event.data,
          direction: event.direction
        })
      },
      onReady: () => {
        setBridgeReady(true)
        addLog({
          source: 'system',
          level: 'system',
          message: 'JSBridge ready'
        })
      }
    })

    registerHandlers(bridge, {
      getWebview: () => webviewRef.current,
      getConfig: () => useBridgeStore.getState(),
      log: (message, detail) =>
        addLog({ source: 'system', level: 'system', message, detail }),
      onAuthExpired: handleAuthExpired
    })

    bridgeRef.current = bridge
  }, [pageState, addLog, handleAuthExpired])

  // ===== 监听 webview 事件 =====
  useEffect(() => {
    if (pageState !== 'main') return
    const wv = webviewRef.current
    if (!wv) return

    const onIpcMessage = (event: Electron.IpcMessageEvent) => {
      if (event.channel === 'bridge-message' && bridgeRef.current) {
        bridgeRef.current.onMessageReceived(event.args[0] as string)
      }
    }

    const onConsoleMessage = (e: Electron.ConsoleMessageEvent) => {
      const levelMap = ['debug', 'log', 'warn', 'error'] as const
      const level = levelMap[e.level] ?? 'log'
      addLog({
        source: 'console',
        level,
        message: e.message || ''
      })
    }

    const onDidStartLoading = () => {
      setIsLoading(true)
      setBridgeReady(false)
    }

    const onDidStopLoading = () => {
      setIsLoading(false)
      const currentUrl = wv.getURL()
      setUrl(currentUrl)
      setInputUrl(currentUrl)
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
    }

    const onDidNavigate = () => {
      const currentUrl = wv.getURL()
      setUrl(currentUrl)
      setInputUrl(currentUrl)
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
      localStorage.setItem('qqlink_last_visited_url', currentUrl)
      window.appConfig?.setConfig({ webviewUrl: currentUrl }).catch(() => {})

      // 自动高亮识别当前匹配的模块
      for (const mod of H5_MODULES) {
        if (currentUrl.includes(mod.path)) {
          setCurrentModuleId(mod.id)
          localStorage.setItem('qqlink_last_module_id', mod.id)
          window.appConfig?.setConfig({ lastModuleId: mod.id }).catch(() => {})
          break
        }
      }
    }

    const onDomReady = () => {
      wv.executeJavaScript(`${webviewPolyfills}\n${webviewBridgeSdk}`).catch(() => {})
    }

    wv.addEventListener('ipc-message', onIpcMessage)
    wv.addEventListener('console-message', onConsoleMessage)
    wv.addEventListener('did-start-loading', onDidStartLoading)
    wv.addEventListener('did-stop-loading', onDidStopLoading)
    wv.addEventListener('did-navigate', onDidNavigate)
    wv.addEventListener('did-navigate-in-page', onDidNavigate)
    wv.addEventListener('dom-ready', onDomReady)

    return () => {
      wv.removeEventListener('ipc-message', onIpcMessage)
      wv.removeEventListener('console-message', onConsoleMessage)
      wv.removeEventListener('did-start-loading', onDidStartLoading)
      wv.removeEventListener('did-stop-loading', onDidStopLoading)
      wv.removeEventListener('did-navigate', onDidNavigate)
      wv.removeEventListener('did-navigate-in-page', onDidNavigate)
      wv.removeEventListener('dom-ready', onDomReady)
    }
  }, [pageState, addLog])

  // ===== 设置保存后的回调 =====
  const handleSettingsSaved = (saved: AppConfig) => {
    if (saved.envMode && saved.envMode !== envMode) {
      setEnvMode(saved.envMode)
      useBridgeStore.getState().clearAuth()
      setPageState('login')
      addLog({
        source: 'system',
        level: 'system',
        message: `在设置中更改了运行模式为【${ENV_MODES[saved.envMode]?.label || saved.envMode}】。账号不通用，已强制退回登录页。`
      })
      return
    }
    if (saved.envMode) setEnvMode(saved.envMode)
    if (saved.h5BaseUrl) setCurrentBaseUrl(saved.h5BaseUrl)
    if (saved.locale) setLocale(saved.locale)
    if (saved.withDebugParams !== undefined) setWithDebugParams(saved.withDebugParams)
    if (saved.lastModuleId) setCurrentModuleId(saved.lastModuleId)
    if (saved.webviewUrl && saved.webviewUrl !== url) {
      setUrl(saved.webviewUrl)
      setInputUrl(saved.webviewUrl)
      try {
        webviewRef.current?.loadURL(saved.webviewUrl)
      } catch {
        // 忽略
      }
    }
  }

  // ===== checking 状态：加载中 =====
  if (pageState === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  // ===== login 状态：登录页 =====
  if (pageState === 'login') {
    return <LoginPage onLoginSuccess={handleLoginSuccess} initialEnvMode={envMode} />
  }

  // 获取当前选中的模块对象
  const currentModule = H5_MODULES.find((m) => m.id === currentModuleId) || H5_MODULES[0]

  // ===== main 状态：专业 Studio 工作台全局统一亮色布局 =====
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 text-slate-800 select-none">
      {/* ========================================================
          1. 全局顶部统领栏 (Apple Light Studio Header)
      ======================================================== */}
      <header className="h-13 w-full flex items-center justify-between px-4 bg-white border-b border-slate-200 z-30 shrink-0 gap-3 shadow-xs">
        {/* 左侧：品牌 Logo + 桥接状态 */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-500 to-cyan-500 flex items-center justify-center shadow-xs shadow-blue-500/20 shrink-0">
              <Zap className="w-3.5 h-3.5 text-white fill-white" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold tracking-tight text-slate-900">
                QQLink Studio
              </span>
              <span
                className={cn(
                  'text-[9px] font-mono font-semibold px-1 py-0.2 rounded border transition-colors',
                  envMode === 'test'
                    ? 'bg-purple-50 text-purple-600 border-purple-200'
                    : 'bg-blue-50 text-blue-600 border-blue-200'
                )}
              >
                {envMode === 'test' ? 'TEST (test)' : 'MAIN (info)'}
              </span>
            </div>
          </div>

          {/* 桥接就绪状态指示器 */}
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono border transition-all',
              bridgeReady
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
            )}
            title={bridgeReady ? 'H5 JSBridge 已建立通信' : '等待 H5 JSBridge 注入...'}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                bridgeReady ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-amber-500'
              )}
            />
            <span>{bridgeReady ? 'Ready' : 'Connecting'}</span>
          </div>
        </div>

        {/* 垂直分割线 */}
        <div className="h-4 w-px bg-slate-200 shrink-0" />

        {/* 双模式切换胶囊开关 (正式环境 main vs 测试环境 test SPA 全桥接) */}
        <div className="flex items-center rounded-lg bg-slate-100/90 p-0.5 border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => handleRequestSwitchEnvMode('prod')}
            className={cn(
              'px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer',
              envMode === 'prod'
                ? 'bg-white text-blue-600 shadow-xs border border-blue-200 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            )}
            title="正式环境 (main 分支项目: https://module.qqlink.info)"
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                envMode === 'prod' ? 'bg-blue-500' : 'bg-slate-300'
              )}
            />
            <span>正式 (main)</span>
          </button>
          <button
            type="button"
            onClick={() => handleRequestSwitchEnvMode('test')}
            className={cn(
              'px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer',
              envMode === 'test'
                ? 'bg-white text-purple-600 shadow-xs border border-purple-200 font-bold'
                : 'text-slate-500 hover:text-slate-800'
            )}
            title="测试环境 (test 分支 SPA 全桥接: https://module.qqlink.buzz)"
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                envMode === 'test' ? 'bg-purple-500' : 'bg-slate-300'
              )}
            />
            <span>测试 (test)</span>
          </button>
        </div>

        {/* 垂直分割线 */}
        <div className="h-4 w-px bg-slate-200 shrink-0" />

        {/* 中间：一体化地址导航栏 (Omnibar) */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* 历史前进后退刷新 */}
          <div className="flex items-center rounded-lg bg-slate-100/80 p-0.5 border border-slate-200/80 shrink-0">
            <NavBtn onClick={handleBack} disabled={!canGoBack} title="后退">
              <ArrowLeft className="w-3.5 h-3.5" />
            </NavBtn>
            <NavBtn onClick={handleForward} disabled={!canGoForward} title="前进">
              <ArrowRight className="w-3.5 h-3.5" />
            </NavBtn>
            <NavBtn onClick={handleRefresh} title="刷新当前页面">
              <RotateCw className="w-3.5 h-3.5" />
            </NavBtn>
          </div>

          {/* 快捷模块分类下拉列表 (使用组件库 Select 下拉组件) */}
          <Select
            value={currentModuleId}
            onValueChange={(val) => {
              const mod = H5_MODULES.find((m) => m.id === val)
              if (mod) handleSelectModule(mod)
            }}
          >
            <SelectTrigger className="h-8 w-auto min-w-[140px] max-w-[180px] bg-slate-50 hover:bg-slate-100/80 border-slate-200/80 text-xs font-semibold text-slate-800 shrink-0 gap-1.5 px-2.5">
              <div className="flex items-center gap-1.5 truncate">
                <Boxes className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">{currentModule.name}</span>
              </div>
            </SelectTrigger>
            <SelectContent className="max-h-[380px] min-w-[240px]">
              {MODULE_CATEGORIES.map((cat, idx) => {
                const catModules = H5_MODULES.filter((m) => m.category === cat.id)
                if (!catModules.length) return null
                return (
                  <Fragment key={cat.id}>
                    {idx > 0 && <SelectSeparator />}
                    <SelectGroup>
                      <SelectLabel>{cat.name}</SelectLabel>
                      {catModules.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <div className="flex items-center justify-between w-full gap-3">
                            <div className="flex items-center gap-2">
                              <ModuleIcon moduleId={m.id} category={m.category} className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span className="font-medium text-slate-800">{m.name}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">{m.path}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </Fragment>
                )
              })}
            </SelectContent>
          </Select>

          {/* 地址栏输入框 (集成一键复制与快捷跳转) */}
          <form
            className="flex items-center flex-1 min-w-[200px] bg-slate-50 hover:bg-slate-100/60 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15 border border-slate-200/80 rounded-lg h-8 px-2.5 transition-all"
            onSubmit={(e) => {
              e.preventDefault()
              handleNavigate()
            }}
          >
            <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1.5" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="输入 H5 页面完整路由或相对路径..."
              className="w-full bg-transparent text-xs text-slate-800 placeholder:text-slate-400 font-mono outline-none min-w-0"
            />
            <div className="flex items-center gap-1 shrink-0 ml-1.5">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                title="复制当前完整 URL"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="submit"
                className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                title="前往此页面 (Enter 回车)"
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>

          {/* 设备机型选择 (使用组件库 Select 下拉组件) */}
          <Select
            value={bridgeConfig.deviceId}
            onValueChange={(val) => bridgeConfig.setConfig('deviceId', val)}
          >
            <SelectTrigger className="h-8 w-auto min-w-[130px] bg-slate-50 hover:bg-slate-100/80 border-slate-200/80 text-xs font-medium text-slate-700 shrink-0 gap-1.5 px-2.5">
              <div className="flex items-center gap-1.5 truncate">
                <Smartphone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">{device.name}</span>
              </div>
            </SelectTrigger>
            <SelectContent className="min-w-[180px]">
              <SelectGroup>
                <SelectLabel>真机规格</SelectLabel>
                {DEVICE_PROFILES.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    <div className="flex items-center justify-between w-full gap-3">
                      <span>{d.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {d.width}×{d.height}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* 垂直分割线 */}
        <div className="h-4 w-px bg-slate-200 shrink-0" />

        {/* 右侧：DevTools 调试工具 + 日志开关 + 用户状态 + 设置 */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 开发者工具按钮组 */}
          <div className="flex items-center rounded-lg bg-slate-100/80 p-0.5 border border-slate-200/80 shrink-0">
            <button
              type="button"
              onClick={() => window.bridge?.toggleWebviewDevTools?.()}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium text-slate-700 hover:text-blue-600 hover:bg-white transition-all cursor-pointer"
              title="切换 H5 网页内嵌控制台 (审查元素/断点/网络)"
            >
              <Bug className="w-3.5 h-3.5 text-blue-500" />
              <span>H5 调试</span>
            </button>
            <button
              type="button"
              onClick={() => window.bridge?.toggleDevTools?.()}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white transition-all cursor-pointer"
              title="切换主窗口控制台 (F12 / Cmd+Opt+I)"
            >
              <Code className="w-3.5 h-3.5 text-slate-500" />
              <span>F12</span>
            </button>
          </div>

          {/* 切换日志侧面板 */}
          <button
            type="button"
            onClick={() => setShowLogPanel(!showLogPanel)}
            className={cn(
              'h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border shrink-0',
              showLogPanel
                ? 'bg-blue-50 text-blue-600 border-blue-200 font-semibold'
                : 'bg-white text-slate-600 hover:text-slate-900 border-slate-200 hover:bg-slate-50'
            )}
            title="显示/隐藏控制台与桥接日志面板"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>日志</span>
          </button>

          {/* 垂直分割线 */}
          <div className="h-4 w-px bg-slate-200 shrink-0" />

          {/* 当前登录用户标识 */}
          <div
            className="flex items-center gap-1.5 rounded-lg bg-slate-100/80 border border-slate-200/80 px-2.5 py-1 text-xs font-mono text-slate-700 select-none shrink-0"
            title={`当前登录 User ID: ${userID || '未登录'}`}
          >
            <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-black text-white shrink-0">
              U
            </span>
            <span className="max-w-[80px] truncate font-semibold">
              {userID || '未登录'}
            </span>
          </div>

          {/* 设置按钮 */}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80 transition-colors cursor-pointer shrink-0"
            title="应用与 H5 域名环境配置"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* 退出登录 */}
          <button
            type="button"
            onClick={handleLogout}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/80 transition-colors cursor-pointer shrink-0"
            title="退出登录"
          >
            <Power className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ========================================================
          2. 主工作区：拟真手机画布 + 日志控制台 (左侧栏已彻底删除)
      ======================================================== */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* 拟真 iPhone 17 模拟器画布 (自适应尺寸，日志展开时靠左，收起时居中) */}
        <main
          className={cn(
            'h-full flex flex-col items-center justify-between p-2.5 relative studio-canvas-pattern overflow-hidden select-none transition-all',
            showLogPanel
              ? 'w-[390px] xl:w-[430px] shrink-0 border-r border-slate-200'
              : 'flex-1'
          )}
        >
          {/* 拟真手机框架容器 (严格按实际分辨率比例缩放，杜绝肥大与拉伸变形) */}
          <div className="flex-1 flex items-center justify-center w-full min-h-0 overflow-hidden py-1">
            <div
              className="relative flex items-center justify-center transition-transform"
              style={{
                width: (device.width + 16) * zoom,
                height: (device.height + 16) * zoom
              }}
            >
              <div
                style={{
                  width: device.width + 16,
                  height: device.height + 16,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center'
                }}
                className="relative shrink-0 select-none"
              >
                {/* 真实 iPhone 17 Pro 钛金属侧边实体按键 */}
                {/* 动作按键 (Action Button) */}
                <div className="absolute -left-[5px] top-28 w-[5px] h-8 bg-gradient-to-b from-slate-400 to-slate-500 rounded-l-sm" />
                {/* 音量+ */}
                <div className="absolute -left-[5px] top-40 w-[5px] h-12 bg-gradient-to-b from-slate-400 to-slate-500 rounded-l-sm" />
                {/* 音量- */}
                <div className="absolute -left-[5px] top-56 w-[5px] h-12 bg-gradient-to-b from-slate-400 to-slate-500 rounded-l-sm" />
                {/* 电源锁定键 */}
                <div className="absolute -right-[5px] top-42 w-[5px] h-18 bg-gradient-to-b from-slate-400 to-slate-500 rounded-r-sm" />

                {/* iPhone 17 原色钛金属机身外框 */}
                <div className="w-full h-full rounded-[54px] p-[4px] bg-gradient-to-b from-slate-300 via-slate-100 to-slate-400 phone-shadow flex flex-col">
                  {/* 内层黑色极窄边框 (超窄边框设计) */}
                  <div className="w-full h-full rounded-[50px] p-[3px] bg-black relative flex flex-col overflow-hidden">
                    {/* 屏幕内容区 (纯净白底，支持 Flutter 风格 SafeArea 避让) */}
                    <div className="w-full h-full rounded-[47px] overflow-hidden bg-white relative flex flex-col">
                      {/* 1. iOS 原生状态栏 (如 Flutter SafeArea 顶部状态栏，高度 47px，避让灵动岛) */}
                      {useSafeArea ? (
                        <div className="h-[47px] w-full bg-white flex items-center justify-between px-6 shrink-0 relative z-30 select-none">
                          {/* 左侧：原生时钟 */}
                          <span className="text-[13px] font-semibold tracking-tight text-slate-900 font-sans pl-1">
                            9:41
                          </span>

                          {/* 中间：iPhone 17 灵动岛 (居中嵌入状态栏内部，绝不遮挡下方的 WebView 网页内容) */}
                          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full shadow-md flex items-center justify-between px-3 pointer-events-none">
                            {/* 前置摄像头微透镜反光 */}
                            <div className="w-2.5 h-2.5 rounded-full bg-[#0a0a0a] border border-white/20 flex items-center justify-center">
                              <div className="w-1 h-1 rounded-full bg-blue-900" />
                            </div>
                            {/* 面容 ID 传感器 */}
                            <div className="w-1.5 h-1.5 rounded-full bg-[#111]" />
                            {/* 听筒微隙 */}
                            <div className="w-6 h-1 rounded-full bg-[#1a1a1a]" />
                          </div>

                          {/* 右侧：原生蜂窝网络、5G 与电池图标 */}
                          <div className="flex items-center gap-1.5 text-slate-900 pr-1">
                            {/* 信号条 */}
                            <svg className="w-4 h-3 text-slate-900" viewBox="0 0 16 12" fill="currentColor">
                              <rect x="1" y="9" width="2.5" height="3" rx="0.5" />
                              <rect x="5" y="6" width="2.5" height="6" rx="0.5" />
                              <rect x="9" y="3" width="2.5" height="9" rx="0.5" />
                              <rect x="13" y="0.5" width="2.5" height="11.5" rx="0.5" />
                            </svg>
                            <span className="text-[10px] font-bold tracking-tighter">5G</span>
                            {/* 电池 */}
                            <div className="w-5 h-2.5 rounded-[3px] border border-slate-900 p-0.5 flex items-center">
                              <div className="h-full w-3.5 bg-slate-900 rounded-[1px]" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* 全屏沉浸模式下的悬浮灵动岛 */
                        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-30 flex items-center justify-between px-3 pointer-events-none shadow-md">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#0a0a0a] border border-white/20 flex items-center justify-center">
                            <div className="w-1 h-1 rounded-full bg-blue-900" />
                          </div>
                          <div className="w-1.5 h-1.5 rounded-full bg-[#111]" />
                          <div className="w-6 h-1 rounded-full bg-[#1a1a1a]" />
                        </div>
                      )}

                      {/* 2. WebView 真实网页区域 (在 SafeArea 保护下，顶部标题栏《指数》具有完整的呼吸空间) */}
                      <div className="flex-1 w-full min-h-0 relative overflow-hidden bg-white">
                        <webview
                          ref={webviewRef as never}
                          src={url || undefined}
                          preload={`file://${preloadPathRef.current}`}
                          useragent={userAgent}
                          allowpopups={"true" as unknown as boolean}
                          webpreferences="contextIsolation=yes,nodeIntegration=no,webSecurity=no,allowRunningInsecureContent=yes"
                          className="h-full w-full"
                          style={{
                            width: device.width,
                            height: useSafeArea ? device.height - 47 - 18 : device.height
                          }}
                        />

                        {/* 页面加载进度条 */}
                        {isLoading && (
                          <div className="absolute top-0 left-0 h-1 w-full z-30 overflow-hidden bg-blue-100">
                            <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-500 animate-pulse" />
                          </div>
                        )}
                      </div>

                      {/* 3. iOS 原生底部 Home Indicator 触控条 */}
                      {useSafeArea && (
                        <div className="h-[18px] w-full bg-white flex items-center justify-center shrink-0 select-none">
                          <div className="w-32 h-[4px] bg-slate-300 rounded-full" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 底部紧凑悬浮信息与缩放控制胶囊 */}
          <div className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-sm text-[11px] font-mono text-slate-600 shrink-0">
            {/* 机型尺寸 */}
            <span className="shrink-0 text-slate-700 font-semibold text-[10px]">
              {device.name}
            </span>

            {/* Flutter 风格 SafeArea 开关 */}
            <button
              type="button"
              onClick={() => setUseSafeArea(!useSafeArea)}
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-sans font-medium transition-colors cursor-pointer border shrink-0',
                useSafeArea
                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              )}
              title="切换 Flutter SafeArea 状态栏避让"
            >
              {useSafeArea ? 'SafeArea: 开' : '全屏'}
            </button>

            {/* 缩放比例切换 */}
            <div className="flex items-center gap-1 border-l border-slate-200 pl-1.5 shrink-0">
              {[0.75, 0.82, 0.9].map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoom(z)}
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer',
                    zoom === z
                      ? 'bg-blue-600 text-white font-bold'
                      : 'text-slate-500 hover:bg-slate-100'
                  )}
                  title={`缩放至 ${Math.round(z * 100)}%`}
                >
                  {Math.round(z * 100)}%
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* 右栏：核心控制台与桥接日志面板 (占满剩余全部主要视野 flex-1，宽敞舒适) */}
        {showLogPanel && (
          <aside className="flex-1 h-full min-w-[480px] flex flex-col bg-white overflow-hidden z-20 shadow-xs">
            <LogPanel />
          </aside>
        )}
      </div>

      {/* 全局设置弹窗 */}
      {showSettings && (
        <SettingsDialog
          open={showSettings}
          onClose={() => setShowSettings(false)}
          onSaved={handleSettingsSaved}
        />
      )}

      {/* 环境切换二次确认提醒弹窗 */}
      <EnvSwitchConfirmDialog
        open={!!pendingEnvMode}
        currentEnv={envMode}
        targetEnv={pendingEnvMode || (envMode === 'prod' ? 'test' : 'prod')}
        onConfirm={handleConfirmSwitchEnvMode}
        onClose={() => setPendingEnvMode(null)}
      />
    </div>
  )
}

function NavBtn({
  onClick,
  disabled,
  title,
  children
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded text-xs transition-colors disabled:opacity-30 hover:bg-white text-slate-600 hover:text-slate-900 cursor-pointer"
    >
      {children}
    </button>
  )
}

export default App


