import { useCallback, useEffect, useRef, useState } from 'react'
import type { WebviewTag } from 'electron'
import { useBridgeStore } from './store/useBridgeStore'
import { useLogStore } from './store/useLogStore'
import { getDeviceProfile, DEVICE_PROFILES } from './bridge/device-profiles'
import { JsBridge, type JsBridgeEvent } from './bridge/jsbridge'
import { registerHandlers } from './bridge/handlers'
import { webviewBridgeSdk, webviewPolyfills } from './bridge/sdk'
import { LogPanel } from './components/LogPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { cn } from './lib/utils'

function App() {
  const webviewRef = useRef<WebviewTag | null>(null)
  const bridgeRef = useRef<JsBridge | null>(null)
  const preloadPathRef = useRef<string>('')

  const [url, setUrl] = useState('')
  const [inputUrl, setInputUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showLogPanel, setShowLogPanel] = useState(true)
  const [logPanelHeight, setLogPanelHeight] = useState(280)
  const [bridgeReady, setBridgeReady] = useState(false)

  const bridgeConfig = useBridgeStore()
  const addLog = useLogStore((s) => s.addLog)

  const device = getDeviceProfile(bridgeConfig.deviceId)
  const userAgent = bridgeConfig.customUserAgent || device.userAgent

  // 获取 webview preload 路径
  useEffect(() => {
    window.bridge?.getPreloadPath().then((p) => {
      preloadPathRef.current = p
    })
  }, [])

  // 初始化 JsBridge
  useEffect(() => {
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
  }, [addLog])

  // 监听 webview 的 ipc-message（H5 -> Native 桥接消息）
  useEffect(() => {
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
      // 注入 polyfill + SDK
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
  }, [addLog])

  // 首次加载默认 URL
  useEffect(() => {
    if (bridgeConfig.defaultUrl && !url && webviewRef.current) {
      const target = bridgeConfig.defaultUrl
      setUrl(target)
      setInputUrl(target)
      webviewRef.current.loadURL(target)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeConfig.defaultUrl])

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

  // 日志面板拖拽调整高度
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = logPanelHeight
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY
      setLogPanelHeight(Math.max(120, Math.min(600, startHeight + delta)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [logPanelHeight])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* 工具栏 */}
      <header className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
        {/* 导航按钮 */}
        <div className="flex gap-1">
          <button
            onClick={handleBack}
            disabled={!canGoBack}
            className="flex h-8 w-8 items-center justify-center rounded text-sm disabled:opacity-30 hover:bg-accent"
            title="后退"
          >
            ←
          </button>
          <button
            onClick={handleForward}
            disabled={!canGoForward}
            className="flex h-8 w-8 items-center justify-center rounded text-sm disabled:opacity-30 hover:bg-accent"
            title="前进"
          >
            →
          </button>
          <button
            onClick={handleRefresh}
            className="flex h-8 w-8 items-center justify-center rounded text-sm hover:bg-accent"
            title="刷新"
          >
            ⟳
          </button>
        </div>

        {/* 地址栏 */}
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            handleNavigate()
          }}
        >
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="输入 URL 或搜索"
            className="flex h-8 flex-1 rounded-md border border-input bg-background px-3 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            'flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium',
            bridgeReady
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-600'
          )}
          title="JSBridge 连接状态"
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              bridgeReady ? 'bg-emerald-500' : 'bg-amber-500'
            )}
          />
          {bridgeReady ? 'Bridge' : '...'}
        </div>

        {/* 面板开关 */}
        <button
          onClick={() => setShowLogPanel((v) => !v)}
          className={cn(
            'flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors',
            showLogPanel
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border hover:bg-accent'
          )}
        >
          日志
        </button>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className={cn(
            'flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors',
            showSettings
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border hover:bg-accent'
          )}
        >
          设置
        </button>
      </header>

      {/* 主体区域 */}
      <div className="relative flex min-h-0 flex-1">
        {/* WebView 容器 + 设备框架 */}
        <main className="flex min-w-0 flex-1 items-center justify-center overflow-auto bg-zinc-900/95 p-4">
          <div
            className="relative shrink-0 overflow-hidden rounded-[2rem] border-[8px] border-zinc-800 bg-black shadow-2xl"
            style={{
              width: device.width + 16,
              height: device.height + 16
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
          </div>
        </main>

        {/* 设置面板 */}
        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      </div>

      {/* 日志面板 */}
      {showLogPanel && (
        <>
          <div
            onMouseDown={onResizeStart}
            className="h-1 cursor-row-resize bg-border hover:bg-primary/50"
          />
          <div
            className="shrink-0 border-t border-border bg-zinc-950"
            style={{ height: logPanelHeight }}
          >
            <LogPanel />
          </div>
        </>
      )}
    </div>
  )
}

export default App
