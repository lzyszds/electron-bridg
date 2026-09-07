import { app, BrowserWindow, ipcMain, shell, dialog, webContents, globalShortcut, session } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import Store from 'electron-store'
import { writeFile } from 'node:fs/promises'

// 忽略自签名/测试环境 SSL 证书错误，还原移动端环境
app.commandLine.appendSwitch('ignore-certificate-errors')
app.commandLine.appendSwitch('disable-site-isolation-trials')
app.commandLine.appendSwitch('disable-web-security')
import { STORE_CHANNELS } from '../shared/types'
import {
  BRIDGE_CHANNELS,
  type HttpRequestPayload,
  type SaveImagePayload
} from '../shared/bridge'
import { loadConfig, saveConfig, type AppConfig } from './config'
import {
  saveToken,
  getToken,
  getUserID,
  isTokenValid,
  clearToken,
  getAuthInfo,
  getAuthTokens
} from './auth'
import { login as loginApi, type LoginParams, type LoginResult } from './api'
import { sendEmailCode } from './walletApi'

// 全局持久化存储实例
const store = new Store({
  name: 'app-data',
  defaults: {}
})

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: existsSync(join(__dirname, '../preload/index.cjs'))
        ? join(__dirname, '../preload/index.cjs')
        : join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  setupDevToolsShortcuts(mainWindow.webContents)

  // 开发环境加载 dev server，生产环境加载打包产物
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 注册 electron-store 的 IPC 处理器
 * 所有持久化数据通过主进程统一读写，渲染进程无法直接访问文件系统
 */
function registerStoreIpc(): void {
  ipcMain.handle(STORE_CHANNELS.GET, (_event, key: string) => {
    return store.get(key)
  })

  ipcMain.handle(STORE_CHANNELS.SET, (_event, key: string, value: unknown) => {
    store.set(key, value)
    // 广播变更给所有窗口（多窗口同步）
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(STORE_CHANNELS.CHANGE, key, value)
    })
  })

  ipcMain.handle(STORE_CHANNELS.DELETE, (_event, key: string) => {
    store.delete(key)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(STORE_CHANNELS.CHANGE, key, undefined)
    })
  })

  ipcMain.handle(STORE_CHANNELS.CLEAR, () => {
    store.clear()
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(STORE_CHANNELS.CHANGE, '*', undefined)
    })
  })
}

/**
 * registerStoreIpc 之外的桥接 IPC 处理器
 * 用于模拟 Flutter 端原生能力
 */
function registerBridgeIpc(): void {
  // 返回 webview preload 脚本的绝对路径
  ipcMain.handle(BRIDGE_CHANNELS.GET_PRELOAD_PATH, () => {
    const cjs = join(__dirname, '../preload/bridge-preload.cjs')
    return existsSync(cjs) ? cjs : join(__dirname, '../preload/bridge-preload.mjs')
  })

  // 外部浏览器/系统默认应用打开链接（launchUrl handler）
  ipcMain.handle(BRIDGE_CHANNELS.OPEN_EXTERNAL, async (_event, url: string) => {
    if (!url) return
    await shell.openExternal(url)
  })

  // proxy handler：在主进程转发 HTTP 请求（无 CORS 限制，还原手机端 dio 代理）
  ipcMain.handle(
    BRIDGE_CHANNELS.HTTP_REQUEST,
    async (_event, payload: HttpRequestPayload) => {
      const { url, method, params, header, body } = payload
      const target = new URL(url)

      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value === undefined || value === null) return
          target.searchParams.set(key, String(value))
        })
      }

      const headers: Record<string, string> = {
        ...(header ?? {})
      }

      let requestBody: string | undefined
      if (body !== undefined && body !== null) {
        requestBody =
          typeof body === 'string' ? body : JSON.stringify(body)
        if (!headers['content-type'] && !headers['Content-Type']) {
          headers['content-type'] = 'application/json'
        }
      }

      const res = await fetch(target.toString(), {
        method: method.toUpperCase(),
        headers,
        body: requestBody
      })

      const text = await res.text()
      let data: unknown = text
      try {
        data = JSON.parse(text)
      } catch {
        // 非 JSON 响应保持原文
      }

      return { status: res.status, data }
    }
  )

  // selectFile handler：打开文件选择对话框并上传（简化为返回本地路径）
  ipcMain.handle(
    BRIDGE_CHANNELS.SELECT_FILE,
    async (_event, allowList?: string[]) => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: allowList?.length
          ? [{ name: 'Allowed', extensions: allowList }]
          : undefined
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    }
  )

  // saveImage handler：将 base64/blob 图片保存到用户指定位置
  ipcMain.handle(
    BRIDGE_CHANNELS.SAVE_IMAGE,
    async (_event, payload: SaveImagePayload) => {
      let buf: Buffer

      if (payload.base64) {
        const base64 = payload.base64.includes(',')
          ? payload.base64.split(',')[1]
          : payload.base64
        buf = Buffer.from(base64, 'base64')
      } else if (payload.blob) {
        buf = Buffer.from(payload.blob)
      } else {
        return
      }

      const name = payload.name || `QQLink-web-${Date.now()}.png`
      const result = await dialog.showSaveDialog({
        defaultPath: name,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      })
      if (result.canceled || !result.filePath) return
      await writeFile(result.filePath, buf)
    }
  )
}

/**
 * 注册认证相关 IPC 处理器
 */
function registerAuthIpc(): void {
  ipcMain.handle(
    'auth:login',
    async (_event, params: LoginParams) => {
      console.log('[Auth IPC] >>> 收到前端登录请求, 账号:', params.email)
      try {
        const result = await loginApi(params)
        console.log('[Auth IPC] <<< 登录 API 解析结果:', JSON.stringify(result))

        const chatToken = (result.data?.chatToken || result.data?.token || '') as string
        if (result.errCode === 0 && result.data && chatToken) {
          saveToken({
            token: chatToken,
            refreshToken: result.data.refreshToken || '',
            expireTime: result.data.expireTime || (result.data.chatTokenExpire as number) || 7776000,
            userID: result.data.userID,
            walletToken: result.data.walletToken,
            secretKey: result.data.secretKey,
            kbitToken: result.data.kbitToken,
            chatToken: chatToken
          })
          console.log('[Auth IPC] 登录成功，Token 已保存, userID:', result.data.userID)
          return { success: true, data: { ...result.data, token: chatToken } }
        }
        console.warn('[Auth IPC] 登录失败/需验证, errCode:', result.errCode, 'errMsg:', result.errMsg, 'errDlt:', result.errDlt)
        const detailedMsg = result.errDlt
          ? (result.errMsg && result.errMsg !== result.errDlt ? `${result.errDlt} (${result.errMsg})` : result.errDlt)
          : (result.errMsg || (result.errCode !== undefined ? `登录失败 (错误码: ${result.errCode})` : '登录失败'))
        return {
          success: false,
          errMsg: detailedMsg,
          errCode: result.errCode,
          errDlt: result.errDlt
        }
      } catch (error: any) {
        console.error('[Auth IPC] 登录异常捕获:', error)
        const respData = error?.response?.data
        const errDlt = respData?.errDlt || respData?.ErrDlt || ''
        const baseMsg = respData?.ErrMsg || respData?.errMsg || respData?.message || error?.message || '登录请求失败'
        const errMsg = errDlt ? `${errDlt} (${baseMsg})` : baseMsg
        const errCode = respData?.ErrCode ?? respData?.errCode ?? -1
        return {
          success: false,
          errMsg,
          errCode,
          errDlt
        }
      }
    }
  )

  ipcMain.handle(
    'auth:sendEmailCode',
    async (_event, params: { email: string; codeType: number }) => {
      try {
        const result = await sendEmailCode(params)
        if (result.errCode && result.errCode !== 0) {
          return { success: false, errMsg: result.errMsg || '发送验证码失败' }
        }
        return { success: true }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : '发送验证码失败'
        return { success: false, errMsg }
      }
    }
  )

  ipcMain.handle('auth:getToken', () => getToken())
  ipcMain.handle('auth:isLoggedIn', () => isTokenValid())
  ipcMain.handle('auth:getInfo', () => getAuthInfo())
  ipcMain.handle('auth:getTokens', () => getAuthTokens())
  ipcMain.handle('auth:getUserID', () => getUserID())

  ipcMain.on('auth:logout', () => {
    clearToken()
  })
}

/**
 * 注册配置相关 IPC 处理器
 */
function registerConfigIpc(): void {
  ipcMain.handle('config:get', () => loadConfig())
  ipcMain.handle('config:set', (_event, patch: Partial<AppConfig>) => {
    const updated = saveConfig(patch)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('config:changed', updated)
    })
    return updated
  })
}

/**
 * 为指定的 WebContents 绑定 DevTools 快捷键 (F12, Cmd+Opt+I / Ctrl+Shift+I)
 */
function setupDevToolsShortcuts(contents: Electron.WebContents): void {
  contents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      const isF12 = input.key === 'F12'
      const isDevTools =
        (input.control || input.meta) &&
        (input.alt || input.shift) &&
        input.key.toLowerCase() === 'i'
      if (isF12 || isDevTools) {
        event.preventDefault()
        if (contents.isDevToolsOpened()) {
          contents.closeDevTools()
        } else {
          contents.openDevTools({ mode: 'detach' })
        }
      }
    }
  })
}

/**
 * 注册 DevTools 相关的 IPC 处理与全局快捷键
 */
function registerDevTools(): void {
  // 监听所有新创建的 WebContents (包含 BrowserWindow 及各类 <webview>)
  app.on('web-contents-created', (_event, contents) => {
    setupDevToolsShortcuts(contents)
  })

  // IPC 切换主窗口 DevTools
  ipcMain.on('devtools:toggleMain', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' })
      }
    }
  })

  // IPC 切换 Webview DevTools
  ipcMain.on('devtools:toggleWebview', () => {
    for (const wc of webContents.getAllWebContents()) {
      if (wc !== mainWindow?.webContents && !wc.isDestroyed()) {
        if (wc.isDevToolsOpened()) {
          wc.closeDevTools()
        } else {
          wc.openDevTools({ mode: 'detach' })
        }
      }
    }
  })

  // 全局快捷键注册 (F12, Cmd+Opt+I, Ctrl+Shift+I)
  const toggleFocusedDevTools = () => {
    const focused = webContents.getFocusedWebContents() || mainWindow?.webContents
    if (focused && !focused.isDestroyed()) {
      if (focused.isDevToolsOpened()) {
        focused.closeDevTools()
      } else {
        focused.openDevTools({ mode: 'detach' })
      }
    }
  }

  try {
    globalShortcut.register('F12', toggleFocusedDevTools)
    globalShortcut.register('CommandOrControl+Shift+I', toggleFocusedDevTools)
    globalShortcut.register('CommandOrControl+Alt+I', toggleFocusedDevTools)
  } catch (err) {
    console.warn('[DevTools] 注册全局快捷键异常:', err)
  }
}

/**
 * 还原移动端环境：禁用 CSP 限制，全放行跨域 (CORS)，允许测试/内部环境 SSL
 */
function setupNetworkSecurity(): void {
  // 拦截网络请求重定向：将被 H5 meta CSP 阻断的 qqlink.xin 域名映射到合规且在 CSP 白名单内的 qqlink.live
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (details.url.includes('api.qqlink.xin')) {
      const redirectURL = details.url.replace('api.qqlink.xin', 'api.qqlink.live')
      return callback({ redirectURL })
    }
    if (details.url.includes('chat.qqlink.xin')) {
      const redirectURL = details.url.replace('chat.qqlink.xin', 'chat.qqlink.live')
      return callback({ redirectURL })
    }
    if (details.url.includes('file.qqlink.xin')) {
      const redirectURL = details.url.replace('file.qqlink.xin', 'file.qqlink.live')
      return callback({ redirectURL })
    }
    // 让节点探测优先选 qqlink.live，避开 qqlink.xin 被 H5 页面内部 meta CSP 阻断
    if (details.url.includes('configQQLink.txt')) {
      return callback({
        redirectURL: 'data:text/plain;charset=utf-8,qqlink.live,qqlink.live'
      })
    }
    callback({})
  })

  // 对所有网络请求剥除阻止跨域的 CSP 头，并增加 CORS 支持
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }

    // 移除阻断请求的 CSP 头
    delete responseHeaders['content-security-policy']
    delete responseHeaders['Content-Security-Policy']
    delete responseHeaders['content-security-policy-report-only']
    delete responseHeaders['Content-Security-Policy-Report-Only']

    // 允许跨域访问（还原移动端原生 Webview 无 CORS 限制的环境）
    responseHeaders['access-control-allow-origin'] = ['*']
    responseHeaders['access-control-allow-methods'] = ['GET, POST, PUT, DELETE, PATCH, OPTIONS']
    responseHeaders['access-control-allow-headers'] = ['*']
    responseHeaders['access-control-allow-credentials'] = ['true']

    callback({ responseHeaders })
  })

  // 证书错误处理（允许测试环境与特定内网安全握手）
  app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
    event.preventDefault()
    callback(true)
  })
}

app.whenReady().then(() => {
  setupNetworkSecurity()
  registerStoreIpc()
  registerBridgeIpc()
  registerAuthIpc()
  registerConfigIpc()
  registerDevTools()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})