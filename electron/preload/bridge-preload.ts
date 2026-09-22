import { contextBridge, ipcRenderer } from 'electron'
import { webviewBridgeSdk, webviewPolyfills } from '../../src/bridge/sdk'

/**
 * WebView preload：必须在 H5 任意脚本之前挂上桥。
 * 若等到 dom-ready 再 executeJavaScript，线上 H5 已走 axios，
 * secretKey 为空 → HMAC 失败 → 美股接口 code 50。
 */
const flutterWebView = {
  postMessage: (message: string) => {
    ipcRenderer.sendToHost('bridge-message', message)
  }
}

try {
  const w = window as unknown as {
    FlutterWebView?: typeof flutterWebView
    __QQLINK_WEBVIEW__?: boolean
  }
  w.FlutterWebView = flutterWebView
  w.__QQLINK_WEBVIEW__ = true
  ;(0, eval)(`${webviewPolyfills}\n${webviewBridgeSdk}`)
} catch (err) {
  console.warn('[bridge-preload] 主世界注入失败，尝试 contextBridge:', err)
}

try {
  if (typeof contextBridge?.exposeInMainWorld === 'function') {
    contextBridge.exposeInMainWorld('FlutterWebView', flutterWebView)
    contextBridge.exposeInMainWorld('__QQLINK_WEBVIEW__', true)
  }
} catch {
  // contextIsolation=no 时 expose 会失败，上面已直接写 window
}
