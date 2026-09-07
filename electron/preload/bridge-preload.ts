import { contextBridge, ipcRenderer } from 'electron'

/**
 * WebView preload
 *
 * 在 H5 镜像页面的主世界暴露 `window.FlutterWebView.postMessage`，
 * 将 JS 侧发出的桥接消息转发给宿主的 <webview> 标签（ipc-message 事件）。
 *
 * 还原 Flutter webview_flutter 中 addJavaScriptChannel('FlutterWebView') 的行为。
 */
try {
  if (contextBridge && typeof contextBridge.exposeInMainWorld === 'function') {
    contextBridge.exposeInMainWorld('FlutterWebView', {
      postMessage: (message: string) => {
        ipcRenderer.sendToHost('bridge-message', message)
      }
    })
  } else {
    ;(window as any).FlutterWebView = {
      postMessage: (message: string) => {
        ipcRenderer.sendToHost('bridge-message', message)
      }
    }
  }
} catch {
  try {
    ;(window as any).FlutterWebView = {
      postMessage: (message: string) => {
        ipcRenderer.sendToHost('bridge-message', message)
      }
    }
  } catch {
    // 忽略
  }
}