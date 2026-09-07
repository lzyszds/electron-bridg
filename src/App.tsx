import { useCallback, useEffect, useRef, useState } from 'react'
import type { WebviewTag } from 'electron'
import { useBridgeStore } from './store/useBridgeStore'
import { useLogStore } from './store/useLogStore'
import { getDeviceProfile, DEVICE_PROFILES } from './bridge/device-profiles'
import { JsBridge, type JsBridgeEvent } from './bridge/jsbridge'
import { registerHandlers } from './bridge/handlers'
import { webviewBridgeSdk, webviewPolyfills } from './bridge/sdk'
import { LogPanel } from './components/LogPanel'
import { SettingsDialog } from './components/SettingsDialog'
import LoginPage from './components/LoginPage'
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

  const bridgeConfig = useBridgeStore()
  const addLog = useLogStore((s) => s.addLog)

  const device = getDeviceProfile(bridgeConfig.deviceId)
  const userAgent = bridgeConfig.customUserAgent || device.userAgent

  // ===== 启动时检查登录状态 =====
  useEffect(() => {
    const checkAuth = async () => {
      const auth = window.auth
      if (!auth) {
        setPageState('login')
        return
      }
      try {
        const loggedIn = await auth.isLoggedIn()
        if (loggedIn) {
          const info = await auth.getAuthInfo()
          setUserID(info.userID)
          setPageState('main')
        } else {
          setPageState('login')
        }
      } catch {
        setPageState('login')
      }
    }
    checkAuth()
  }, [])

  // ===== 获取 webview preload 路径 =====
  useEffect(() => {
    window.bridge?.getPreloadPath().then((p) => {
      preloadPathRef.current = p
    })
  }, [])

  // ===== 登录成功后：注入 token 到桥接配置 =====
  const handleLoginSuccess = async (data: { token: string; userID: string }) => {
    setUserID(data.userID)
    setPageState('main')

    // 从主进程拉取真实 token（walletToken/secretKey 等），写入桥接 store
    try {
      const tokens = await window.auth.getAuthTokens()
      useBridgeStore.getState().setAuth('token', tokens.token)
      useBridgeStore.getState().setAuth('secretKey', tokens.secretKey)
      useBridgeStore.getState().setAuth('imToken', tokens.kbitToken)
      useBridgeStore.getState().setAuth('chatToken', tokens.chatToken)
      useBridgeStore.getState().setAuth('userID', data.userID)
      addLog({
        source: 'system',
        level: 'system',
        message: `登录成功，token 已注入桥接配置 (userID: ${data.userID})`
      })
    } catch {
      // 拉取失败不影响进入主界面
    }

    // 从 appConfig 拉取 webviewUrl 作为默认加载地址
    try {
      const cfg = await window.appConfig.getConfig()
      if (cfg.webviewUrl && !useBridgeStore.getState().defaultUrl) {
        useBridgeStore.getState().setConfig('defaultUrl', cfg.webviewUrl)
      }
    } catch {
      // 忽略
    }
  }

  // ===== 退出登录 =====
  const handleLogout = () => {
    window.auth?.logout()
    setUserID('')
    setUrl('')
    setInputUrl('')
    setPageState('login')
  }

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
        addLog({ source: 'system', level: 'system', message, detail })
    })

    bridgeRef.current = bridge
  }, [pageState, addLog])

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
      setUrl(wv.getURL())
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
    }
    const onDidNavigate = () => {
      setUrl(wv.getURL())
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
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

  // ===== 首次加载默认 URL =====
  useEffect(() => {
    if (pageState !== 'main') return
    if (bridgeConfig.defaultUrl && !url && webviewRef.current) {
      const target = bridgeConfig.defaultUrl
      setUrl(target)
      setInputUrl(target)
      webviewRef.current.loadURL(target)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageState, bridgeConfig.defaultUrl])

  const handleNavigate = useCallback(() => {
    const target = inputUrl.trim()
    if (!target) return
    let finalUrl = target
    if (!/^https?:\/\//i.test(target)) {
      finalUrl = `https://${target}`
    }
    setUrl(finalUrl)
    setInputUrl(finalUrl)
    webviewRef.current?.loadURL(finalUrl)
  }, [inputUrl])

  const handleBack = () => webviewRef.current?.goBack()
  const handleForward = () => webviewRef.current?.goForward()
  const handleRefresh = () => webviewRef.current?.reload()

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
    return <LoginPage onLoginSuccess={handleLoginSuccess} />
  }

  // ===== main 状态：双翼布局主界面 =====
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-100 dark:bg-zinc-950">
      {/* ===== 左翼：手机框架 + WebView ===== */}
      <main className="flex h-full items-center justify-center p-6">
        <div
          className="relative shrink-0 overflow-hidden rounded-[2.5rem] border-[10px] border-zinc-800 bg-black shadow-2xl"
          style={{
            width: device.width + 20,
            height: device.height + 20
          }}
        >
          <webview
            ref={webviewRef as never}
            src={url || undefined}
            preload={`file://${preloadPathRef.current}`}
            useragent={userAgent}
            allowpopups
            webpreferences="contextIsolation=yes,nodeIntegration=no"
            className="h-full w-full"
            style={{ width: device.width, height: device.height }}
          />
          {isLoading && (
            <div className="absolute top-0 left-0 h-0.5 w-full animate-pulse bg-primary" />
          )}
          {/* 设备名标签 */}
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-medium text-zinc-500">
            {device.name} · {device.width}×{device.height}
          </div>
        </div>
      </main>

      {/* ===== 右翼：工具栏 + 日志面板 + 状态栏 ===== */}
      <aside className="flex h-full flex-1 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {/* 顶栏 */}
        <header className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
          {/* 导航按钮组 */}
          <div className="flex items-center rounded-lg bg-zinc-100/80 p-0.5 dark:bg-zinc-800/60">
            <NavBtn onClick={handleBack} disabled={!canGoBack} title="后退">
              ←
            </NavBtn>
            <NavBtn onClick={handleForward} disabled={!canGoForward} title="前进">
              →
            </NavBtn>
            <NavBtn onClick={handleRefresh} title="刷新">
              ⟳
            </NavBtn>
          </div>

          {/* 地址栏 */}
          <form
            className="flex flex-1 gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              handleNavigate()
            }}
          >
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="输入 H5 镜像地址"
              className="h-8 flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-xs text-zinc-700 placeholder:text-zinc-400 focus-visible:border-primary focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            />
            <button
              type="submit"
              className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Go
            </button>
          </form>

          {/* 设备选择 */}
          <select
            value={bridgeConfig.deviceId}
            onChange={(e) => bridgeConfig.setConfig('deviceId', e.target.value)}
            className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            title="设备型号"
          >
            {DEVICE_PROFILES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* 桥接状态 */}
          <div
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold',
              bridgeReady
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-amber-500/10 text-amber-600'
            )}
            title="JSBridge 连接状态"
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                bridgeReady ? 'bg-emerald-500' : 'bg-amber-500'
              )}
            />
            {bridgeReady ? 'Bridge' : '...'}
          </div>

          {/* 用户标识 */}
          <div className="flex items-center gap-1.5 rounded-md bg-zinc-50 px-2 py-1 dark:bg-zinc-800/60">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] text-white">
              U
            </span>
            <span
              className="max-w-[100px] truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-300"
              title={userID || '未登录'}
            >
              {userID || '未登录'}
            </span>
          </div>

          {/* 开发者工具 */}
          <button
            type="button"
            onClick={() => window.bridge?.toggleDevTools?.()}
            className="flex h-8 items-center px-2 rounded-md font-mono text-xs font-bold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
            title="切换主窗口开发者工具 (快捷键: F12 / Cmd+Opt+I / Ctrl+Shift+I)"
          >
            F12
          </button>
          <button
            type="button"
            onClick={() => window.bridge?.toggleWebviewDevTools?.()}
            className="flex h-8 items-center px-2 rounded-md text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
            title="切换 H5 网页开发者工具"
          >
            H5调试
          </button>

          {/* 设置按钮 */}
          <button
            onClick={() => setShowSettings(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            title="桥接与应用配置"
          >
            ⚙
          </button>

          {/* 退出登录 */}
          <button
            onClick={handleLogout}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
            title="退出登录"
          >
            ⏻
          </button>
        </header>

        {/* 日志面板（占满剩余空间） */}
        <div className="min-h-0 flex-1 bg-zinc-950">
          <LogPanel />
        </div>

        {/* 底部状态栏 */}
        <footer className="flex items-center gap-2 border-t border-zinc-100 bg-zinc-50 px-3 py-2 text-[10px] font-mono text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="truncate" title={url}>
            {url || '未加载'}
          </span>
        </footer>
      </aside>

      {/* 设置弹窗 */}
      {showSettings && (
        <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
      )}
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
      className="flex h-7 w-7 items-center justify-center rounded text-sm transition-colors disabled:opacity-30 hover:bg-white dark:hover:bg-zinc-700"
    >
      {children}
    </button>
  )
}

export default App
