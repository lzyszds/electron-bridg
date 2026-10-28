import { useCallback, useEffect, useRef, useState, Fragment } from 'react'
import type { WebviewTag } from 'electron'
import { useBridgeStore } from './store/useBridgeStore'
import { defaultBridgeConfig } from './bridge/types'
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
  envPresetPatch,
  isUrlForEnv,
  isBlankUrl,
  withAppChannel,
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

/** 记录「用户主动退出登录」的环境，避免重启后被残留 token 自动带回主页 */
const LOGGED_OUT_KEY = 'qqlink_logged_out_env'

/** 本地 H5 开关标记：开启时 H5 走 localhost:8888，账号与接口仍由 envMode 决定 */
const LOCAL_ENABLED_KEY = 'qqlink_local_enabled'

function App() {
  const [pageState, setPageState] = useState<PageState>('checking')
  const [userID, setUserID] = useState('')

  const webviewRef = useRef<WebviewTag | null>(null)
  const bridgeRef = useRef<JsBridge | null>(null)
  const preloadPathRef = useRef<string>('')
  const [preloadPath, setPreloadPath] = useState('')

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
  const [currentBaseUrl, setCurrentBaseUrl] = useState<string>('https://module.qqlink.live')
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
      // 登录成功（含自动登录）后解除「已主动退出」标记
      localStorage.removeItem(LOGGED_OUT_KEY)
      setUserID(uid)
      try {
        const tokens = await window.auth.getAuthTokens(mode)
        useBridgeStore.getState().setAuth('token', tokens.token)
        useBridgeStore.getState().setAuth('secretKey', tokens.secretKey)
        useBridgeStore.getState().setAuth('imToken', tokens.kbitToken)
        useBridgeStore.getState().setAuth('chatToken', tokens.chatToken)
        useBridgeStore.getState().setAuth('userID', uid)
        // 登录/自动登录拿到的是最新凭据：立刻归档到该环境名下，
        // 后续本地开关、环境切换都从这里取，避免用到上一套旧 token
        useBridgeStore.getState().setAuthForEnv(mode, useBridgeStore.getState().auth)
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
        if (cfg.webviewUrl && isUrlForEnv(cfg.webviewUrl, mode) && !isBlankUrl(cfg.webviewUrl)) {
          targetUrl = cfg.webviewUrl
        }
      } catch {
        // 忽略
      }

      const localLastUrl = localStorage.getItem('qqlink_last_visited_url')
      const localLastMod = localStorage.getItem('qqlink_last_module_id')
      if (localLastUrl && isUrlForEnv(localLastUrl, mode) && !isBlankUrl(localLastUrl)) {
        targetUrl = localLastUrl
      }
      if (localLastMod) targetModId = localLastMod

      // 自动登录成功：写入该环境对应的 token，并归档，供本地模式复用
      try {
        const saved = useBridgeStore.getState().getAuthForEnv(mode)
        if (saved && saved.userID) {
          ;(['token', 'secretKey', 'imToken', 'chatToken', 'userID'] as const).forEach((k) => {
            if (saved[k] && saved[k] !== useBridgeStore.getState().auth[k]) {
              useBridgeStore.getState().setAuth(k, saved[k])
            }
          })
        }
      } catch {
        // 忽略
      }

      setEnvMode(targetEnv)
      setCurrentBaseUrl(targetBase)
      setLocale(targetLocale)
      setWithDebugParams(targetDebug)
      setCurrentModuleId(targetModId)

      // 跨环境留下的 buzz/info/about:blank 地址一律丢弃，按当前环境重拼
      if (!targetUrl || !isUrlForEnv(targetUrl, mode) || isBlankUrl(targetUrl)) {
        const mod = H5_MODULES.find((m) => m.id === targetModId) || H5_MODULES[0]
        targetUrl = withAppChannel(
          buildModuleUrl(targetBase, mod.path, targetLocale, targetDebug)
        )
      } else {
        targetUrl = withAppChannel(targetUrl)
      }

      localStorage.setItem('qqlink_env_mode', mode)
      localStorage.setItem('qqlink_last_visited_url', targetUrl)
      try {
        await window.appConfig?.setConfig({
          ...envPresetPatch(mode),
          lastModuleId: targetModId,
          webviewUrl: targetUrl
        })
      } catch {
        // 忽略
      }

      setUrl(targetUrl)
      setInputUrl(targetUrl)
      setPageState('main')
    },
    [envMode, addLog]
  )

  // 待切换的目标环境模式（非 null 时唤起二次确认提醒弹窗）
  const [pendingEnvMode, setPendingEnvMode] = useState<EnvMode | null>(null)
  /** 最近一次被强制退回登录页的原因，用于在登录页顶部提示 */
  const [logoutReason, setLogoutReason] = useState<string>('')
  /** 本地 H5 开关（与正式/测试并联，不改变 envMode） */
  const [localEnabled, setLocalEnabled] = useState<boolean>(
    () => localStorage.getItem(LOCAL_ENABLED_KEY) === '1'
  )

  // ===== 用户请求切换环境模式：唤起二次确认弹窗 =====
  /**
   * 把当前内存里的凭据归档到「当前环境」名下
   *
   * 正式 / 测试各存一套，切过去时直接取出来用；本地模式归到它选择的后端名下，
   * 这样本地与对应的线上环境共享同一套账号。
   */
  const archiveCurrentAuth = useCallback((env?: string) => {
    const key = env || envMode
    const auth = useBridgeStore.getState().auth
    if (auth.userID || auth.token) {
      useBridgeStore.getState().setAuthForEnv(key, auth)
    }
  }, [envMode])

  /** 从指定环境的归档里恢复凭据；没有可用凭据返回 false */
  const restoreAuthFor = useCallback((env: string): boolean => {
    const saved = useBridgeStore.getState().getAuthForEnv(env)
    if (!saved || !saved.userID || !saved.token) return false
    const store = useBridgeStore.getState()
    ;(['token', 'secretKey', 'imToken', 'chatToken', 'userID'] as const).forEach((k) => {
      store.setAuth(k, saved[k])
    })
    setUserID(saved.userID)
    return true
  }, [])

  /** 按目标环境重建 webview 地址并导航 */
  const navigateToEnvModule = useCallback(
    async (baseUrl: string, reason: string) => {
      const mod = H5_MODULES.find((m) => m.id === currentModuleId) || H5_MODULES[0]
      const nextUrl = withAppChannel(buildModuleUrl(baseUrl, mod.path, locale, withDebugParams))
      setUrl(nextUrl)
      setInputUrl(nextUrl)
      localStorage.setItem('qqlink_last_visited_url', nextUrl)
      setBridgeReady(false)
      try {
        await window.appConfig?.setConfig({ lastModuleId: mod.id, webviewUrl: nextUrl })
        webviewRef.current?.loadURL(nextUrl)
      } catch {
        // 忽略未就绪，src 属性会兜底
      }
      addLog({ source: 'system', level: 'system', message: reason })
    },
    [currentModuleId, locale, withDebugParams, addLog]
  )

  /**
   * 本地开关：它与「正式 / 测试」**并联**，不替换这两个选项
   *
   * - envMode 始终是 prod / test（决定账号、接口、token 从哪套取）
   * - localEnabled 只决定 H5 来源：开 → localhost:8888，关 → 当前 envMode 的线上域名
   * 因此开关过程中 envMode、凭据、authByEnv 都不变，可以在本地模式下直接点正式/测试切换账号体系。
   */
  const handleToggleLocalMode = useCallback(async () => {
    const nextEnabled = !localEnabled
    setLocalEnabled(nextEnabled)
    localStorage.setItem(LOCAL_ENABLED_KEY, nextEnabled ? '1' : '0')

    const baseUrl = nextEnabled ? ENV_MODES.local.h5BaseUrl : ENV_MODES[envMode].h5BaseUrl
    setCurrentBaseUrl(baseUrl)
    try {
      // envMode / wallet / api 保持原样，只换 H5 来源
      await window.appConfig?.setConfig({ h5BaseUrl: baseUrl })
    } catch {
      // 忽略
    }
    await navigateToEnvModule(
      baseUrl,
      nextEnabled
        ? `已开启本地 H5：${baseUrl}（账号与接口沿用【${ENV_MODES[envMode].label}】）`
        : `已关闭本地 H5，回到【${ENV_MODES[envMode].label}】：${baseUrl}`
    )
  }, [localEnabled, envMode, navigateToEnvModule])

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

    // 2. 归档当前环境的凭据，再尝试恢复目标环境已保存的那一套
    archiveCurrentAuth()
    useBridgeStore.getState().clearAuth()
    const restored = restoreAuthFor(targetMode)

    if (restored) {
      // 目标环境有完整凭据：重新从主进程读一次 token 注入桥接，直接进主页
      const info = await window.auth?.getAuthInfo(targetMode)
      await syncTokensAndEnterMain(info?.userID || '', targetMode)
      addLog({
        source: 'system',
        level: 'system',
        message: `已切换至【${preset.label}】，复用该环境已保存的登录态，无需重新登录`
      })
      return
    }

    // 目标环境没有可用凭据：留在登录页，等用户登录这个环境
    localStorage.setItem(LOGGED_OUT_KEY, targetMode)
    addLog({
      source: 'system',
      level: 'system',
      message: `已切换至【${preset.label}】。该环境暂无登录态，请登录该环境账号。`
    })
    setPageState('login')
  }, [pendingEnvMode, addLog, archiveCurrentAuth, restoreAuthFor, syncTokensAndEnterMain])

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
        // 用户主动退出过的环境不再自动登录：即使磁盘上还残留 token（例如退出时 IPC 尚未落盘、
        // 或被其它窗口重新写回），也必须停在登录页，直到重新登录成功才解除标记。
        const loggedOutEnv = localStorage.getItem(LOGGED_OUT_KEY)
        if (loggedOutEnv && loggedOutEnv === curEnv) {
          setPageState('login')
          return
        }
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

  // ===== 获取 webview preload 路径（必须先拿到再挂 <webview>，否则 preload 是 file://undefined） =====
  useEffect(() => {
    window.bridge?.getPreloadPath().then((p) => {
      if (!p) return
      preloadPathRef.current = p
      setPreloadPath(p)
    })
  }, [])

  // ===== 登录成功后进入主界面 =====
  const handleLoginSuccess = async (data: { token: string; userID: string }, fromEnv?: EnvMode) => {
    setLogoutReason('')
    const curEnv = fromEnv || envMode
    setEnvMode(curEnv)
    await syncTokensAndEnterMain(data.userID, curEnv)
  }

  /**
   * 清空登录态：主进程落盘的 auth_<env>.json + 渲染进程内存中的凭据 + 页面状态
   *
   * 只要回到登录页就必须走这里，否则登录页一刷新又会读到旧 token 直接进主页。
   */
  const resetAuthState = useCallback(
    (reason: string, targetEnv?: EnvMode) => {
      const mode = targetEnv || envMode
      // 只清「正在使用的这套」凭据；另一套环境（正式/测试）的归档保持不动，
      // 这样切回去还能直接登录，不用重新输密码。
      useBridgeStore.getState().setAuthForEnv(mode, { ...defaultBridgeConfig.auth })
      // 先打标记再清 token：启动时的自动登录会据此直接停在登录页
      localStorage.setItem(LOGGED_OUT_KEY, mode)
      window.auth?.logout(mode)
      const bridgeStore = useBridgeStore.getState()
      bridgeStore.clearAuth()
      setLogoutReason(reason)
      setUserID('')
      setUrl('')
      setInputUrl('')
      setBridgeReady(false)
      setPageState('login')
      addLog({
        source: 'system',
        level: 'warn',
        message: `已清空【${ENV_MODES[mode]?.label || mode}】登录凭据并退回登录页：${reason}`
      })
    },
    [envMode, addLog]
  )

  // ===== 退出登录 =====
  const handleLogout = useCallback(() => {
    resetAuthState('用户主动退出登录')
  }, [resetAuthState])

  /**
   * Token 失效 / 网页请求重新登录
   *
   * 接口返回 token 不匹配、过期，或 H5 主动走 toLogin / goLogin 时，
   * 必须真正退出并清空凭据，而不是只打一条日志。
   */
  const handleAuthExpired = useCallback(
    (reason?: string) => {
      console.warn('[App] 登录凭据失效:', reason)
      resetAuthState(reason || '接口鉴权失败')
    },
    [resetAuthState]
  )

  // ===== 切换选中的 H5 模块并持久化记忆 =====
  const handleSelectModule = useCallback(
    async (mod: H5Module) => {
      setCurrentModuleId(mod.id)
      localStorage.setItem('qqlink_last_module_id', mod.id)

      const fullUrl = withAppChannel(
        buildModuleUrl(currentBaseUrl, mod.path, locale, withDebugParams)
      )
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

    // 匹配并同步选中的模块（按路径长度降序优先匹配更深层级的具体路由）
    const sortedModules = [...H5_MODULES].sort((a, b) => b.path.length - a.path.length)
    for (const mod of sortedModules) {
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
  /**
   * 刷新 / 跳转前先把桥接状态复位
   *
   * 页面一刷新，H5 里的 WebViewJSBridge 实例就没了，宿主这边必须把「已就绪」清掉、
   * 重新注入 SDK，否则会出现「页面刷出来了但桥接没建立」的情况。
   */
  const reloadWebview = useCallback(() => {
    setBridgeReady(false)
    webviewRef.current?.reload()
  }, [])

  const handleRefresh = () => reloadWebview()

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
      logWire: (entry) =>
        addLog({
          source: 'electron',
          level: entry.level || 'info',
          action: entry.action,
          message: entry.message,
          detail: entry.detail,
          wire: entry.wire
        }),
      onAuthExpired: handleAuthExpired
    })

    bridgeRef.current = bridge
  }, [pageState, preloadPath, addLog, handleAuthExpired])

  // ===== 监听 webview 事件 =====
  useEffect(() => {
    if (pageState !== 'main') return
    const wv = webviewRef.current
    if (!wv) return

    const onIpcMessage = (event: Electron.IpcMessageEvent) => {
      // 刷新/跳转是异步的：did-start-loading 先到，但 H5 新页面可能在旧监听器移除、
      // 新监听器挂上之前就发出第一波请求（getNodeConfig / proxy）。以前这里直接丢弃，
      // 表现就是「刷新后页面空数据、桥接无回包」。现在只复位等待队列、延迟派发，
      // 保证新页面发出的请求一定有人接。
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
      // 任何一次加载（刷新/跳转/H5 自身 location 变化）都会销毁页面里的桥，
      // 统一在这里复位，等 H5 重新发 ready 再置回已就绪
      setBridgeReady(false)
    }

    const syncUrlFromWebview = () => {
      try {
        const currentUrl = wv.getURL()
        // 绝不能把 about:blank 写回 state，否则 withAppChannel 会变成 about:blank?channel=qqlink 死循环
        if (isBlankUrl(currentUrl)) return
        setUrl(currentUrl)
        setInputUrl(currentUrl)
        setCanGoBack(wv.canGoBack())
        setCanGoForward(wv.canGoForward())
        localStorage.setItem('qqlink_last_visited_url', currentUrl)
        window.appConfig?.setConfig({ webviewUrl: currentUrl }).catch(() => {})

        const sortedModules = [...H5_MODULES].sort((a, b) => b.path.length - a.path.length)
        for (const mod of sortedModules) {
          if (currentUrl.includes(mod.path)) {
            setCurrentModuleId(mod.id)
            localStorage.setItem('qqlink_last_module_id', mod.id)
            window.appConfig?.setConfig({ lastModuleId: mod.id }).catch(() => {})
            break
          }
        }
      } catch {
        // webview 尚未 dom-ready
      }
    }

    const onDidStopLoading = () => {
      setIsLoading(false)
      syncUrlFromWebview()
    }

    const onDidNavigate = () => {
      syncUrlFromWebview()
    }

    const onDomReady = () => {
      // 新页面 dom-ready 时清一次旧的等待队列；此后到达的请求都是新页面发的，正常处理
      bridgeRef.current?.resetPending()
      wv.executeJavaScript(
        `${webviewPolyfills}\n${webviewBridgeSdk}\nwindow.__QQLINK_WEBVIEW__=true;`
      ).catch(() => {})
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
  }, [pageState, preloadPath, addLog])

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
      <header className="w-full shrink-0 z-30 bg-white border-b border-slate-200 shadow-xs">
        {/* ─────────── 第一行：主控行（导航 / 地址栏 / 账号） ─────────── */}
        <div className="h-12 w-full flex items-center gap-3 px-4 border-b border-slate-100">

          {/* 地址栏区块：历史导航按钮 + 一体化 Omnibar（独占全部剩余宽度，永不挤压） */}
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

            {/* 地址栏输入框 (集成一键复制与快捷跳转) */}
            <form
              className="flex items-center flex-1 min-w-[240px] bg-slate-50 hover:bg-slate-100/60 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15 border border-slate-200/80 rounded-lg h-8 px-2.5 transition-all"
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
          </div>

          {/* 垂直分割线 */}
          <div className="h-4 w-px bg-slate-200 shrink-0" />

          {/* 账号操作区：当前登录用户 / 设置 / 退出 */}
          <div className="flex items-center gap-2 shrink-0">
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
        </div>

        {/* ─────────── 第二行：上下文与开发者工具行 ─────────── */}
        <div className="h-10 w-full flex items-center gap-2 px-4 bg-slate-50/70">
          {/* 环境切换胶囊开关 (正式 main / 测试 test / 本地 local) */}
          <div className="flex items-center rounded-lg bg-slate-100/90 p-0.5 border border-slate-200 shrink-0">
            {(['prod', 'test'] as EnvMode[]).map((mode) => {
              const preset = ENV_MODES[mode]
              const active = envMode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleRequestSwitchEnvMode(mode)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer',
                    active
                      ? mode === 'test'
                        ? 'bg-white text-purple-600 shadow-xs border border-purple-200 font-bold'
                        : 'bg-white text-blue-600 shadow-xs border border-blue-200 font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  )}
                  title={`${preset.label} — ${preset.h5BaseUrl}`}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      active
                        ? mode === 'test'
                          ? 'bg-purple-500'
                          : 'bg-blue-500'
                        : 'bg-slate-300'
                    )}
                  />
                  <span>{preset.shortLabel}</span>
                </button>
              )
            })}

            {/* 本地开关：开 → H5 走 localhost，后端沿用最近一次选中的正式/测试；关 → 回到原线上环境 */}
            <button
              type="button"
              onClick={() => handleToggleLocalMode()}
              className={cn(
                'ml-0.5 h-6 px-2 rounded-md transition-all flex items-center gap-1.5 cursor-pointer',
                localEnabled
                  ? 'bg-white text-emerald-600 shadow-xs border border-emerald-200'
                  : 'text-slate-400 hover:text-slate-700'
              )}
              title={
                localEnabled
                  ? `本地 H5 已开启（${ENV_MODES.local.h5BaseUrl}），账号与接口沿用【${ENV_MODES[envMode].label}】— 点击关闭`
                  : '开启本地 H5：只把页面换成 localhost，正式/测试的账号与接口保持不变'
              }
              aria-pressed={localEnabled}
            >
              <span
                className={cn(
                  'relative inline-flex h-3 w-5 items-center rounded-full transition-colors',
                  localEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                )}
              >
                <span
                  className={cn(
                    'absolute h-2 w-2 rounded-full bg-white shadow transition-all',
                    localEnabled ? 'left-2.5' : 'left-0.5'
                  )}
                />
              </span>
              <span className="text-[10px] font-black tracking-wider">本地</span>
            </button>
          </div>

          {/* 垂直分割线 */}
          <div className="h-4 w-px bg-slate-200 shrink-0" />

          {/* 快捷模块分类下拉列表 (使用组件库 Select 下拉组件) */}
          <Select
            value={currentModuleId}
            onValueChange={(val) => {
              const mod = H5_MODULES.find((m) => m.id === val)
              if (mod) handleSelectModule(mod)
            }}
          >
            <SelectTrigger className="h-7 w-auto min-w-[150px] max-w-[220px] bg-white hover:bg-slate-100 border-slate-200/80 text-xs font-semibold text-slate-800 shrink-0 gap-1.5 px-2.5">
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

          {/* 设备机型选择 (使用组件库 Select 下拉组件) */}
          <Select
            value={bridgeConfig.deviceId}
            onValueChange={(val) => bridgeConfig.setConfig('deviceId', val)}
          >
            <SelectTrigger className="h-7 w-auto min-w-[150px] bg-white hover:bg-slate-100 border-slate-200/80 text-xs font-medium text-slate-700 shrink-0 gap-1.5 px-2.5">
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

          {/* 弹性占位：把开发者工具组推向右侧 */}
          <div className="flex-1 min-w-2" />

          {/* 开发者工具按钮组 */}
          <div className="flex items-center rounded-lg bg-white p-0.5 border border-slate-200/80 shrink-0">
            <button
              type="button"
              onClick={() => window.bridge?.toggleWebviewDevTools?.()}
              className="flex items-center gap-1.5 h-6 px-2.5 rounded-md text-xs font-medium text-slate-700 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-pointer"
              title="切换 H5 网页内嵌控制台 (审查元素/断点/网络)"
            >
              <Bug className="w-3.5 h-3.5 text-blue-500" />
              <span>H5 调试</span>
            </button>
            <button
              type="button"
              onClick={() => window.bridge?.toggleDevTools?.()}
              className="flex items-center gap-1.5 h-6 px-2.5 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all cursor-pointer"
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
              'h-7 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border shrink-0',
              showLogPanel
                ? 'bg-blue-50 text-blue-600 border-blue-200 font-semibold'
                : 'bg-white text-slate-600 hover:text-slate-900 border-slate-200/80 hover:bg-slate-100'
            )}
            title="显示/隐藏控制台与桥接日志面板"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>日志</span>
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
                        {preloadPath && url && !isBlankUrl(url) ? (
                        <webview
                          key={preloadPath}
                          ref={webviewRef as never}
                          src={withAppChannel(url)}
                          preload={`file://${preloadPath}`}
                          useragent={userAgent}
                          allowpopups={"true" as unknown as boolean}
                          webpreferences="contextIsolation=no,nodeIntegration=no,webSecurity=no,allowRunningInsecureContent=yes"
                          className="h-full w-full"
                          style={{
                            width: device.width,
                            height: useSafeArea ? device.height - 47 - 18 : device.height
                          }}
                        />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-slate-400">
                            正在准备 WebView 桥接…
                          </div>
                        )}

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


