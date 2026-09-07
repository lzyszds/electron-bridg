import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'node:path'
import Store from 'electron-store'
import { writeFile } from 'node:fs/promises'
import { STORE_CHANNELS } from '../shared/types'
import {
  BRIDGE_CHANNELS,
  type HttpRequestPayload,
  type SaveImagePayload
} from '../shared/bridge'

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
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

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
    return join(__dirname, '../preload/bridge-preload.mjs')
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

app.whenReady().then(() => {
  registerStoreIpc()
  registerBridgeIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})