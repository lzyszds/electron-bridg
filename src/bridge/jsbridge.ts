import type { WebviewTag } from 'electron'

export type JsBridgeExecutor = (script: string) => Promise<unknown>

export type JsBridgeHandler = (data: unknown) => Promise<unknown> | unknown

export interface JsBridgeMessage {
  action: string
  data?: unknown
  id: number
  type: 'request' | 'response'
  resolved: boolean
  rejected: boolean
}

export interface JsBridgeEvent {
  /** request | response */
  kind: 'request' | 'response'
  /** H5 -> Native (in) 或 Native -> H5 (out) */
  direction: 'in' | 'out'
  action: string
  data?: unknown
  message: JsBridgeMessage
}

export interface JsBridgeOptions {
  /** 执行 JS 代码的函数（webview.executeJavaScript） */
  executor: JsBridgeExecutor
  /** 桥接事件日志回调 */
  onEvent?: (event: JsBridgeEvent) => void
  /** 初始化完成标记（#jsbridgeReady# 被调用） */
  onReady?: () => void
}

/**
 * WebViewJSBridge 协议实现
 *
 * 复刻 Flutter 端 flutter_jsbridge_sdk 的 JSBridge 类：
 * - request/response 双向调用
 * - 消息 { action, data, id, type, resolved, rejected }
 * - JS -> Native 通过 window.FlutterWebView.postMessage(encodeURIComponent(json))
 * - Native -> JS 通过执行 WebViewJSBridge.onMessageReceived("...")
 */
export class JsBridge {
  private handlers = new Map<string, JsBridgeHandler>()
  private completers = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >()
  private executor: JsBridgeExecutor
  private nextId = 0
  private onEvent?: JsBridgeOptions['onEvent']
  private onReady?: JsBridgeOptions['onReady']

  constructor(options: JsBridgeOptions) {
    this.executor = options.executor
    this.onEvent = options.onEvent
    this.onReady = options.onReady

    this.registerHandler('#jsbridgeReady#', async () => {
      this.onReady?.()
      return true
    })

    // H5 刷新后 SDK 会重新执行，ready 事件可能早于我们的注入，这里再兜一次
    this.registerHandler('jsbridgeReady', async () => {
      this.onReady?.()
      return true
    })
  }

  /** 页面重新加载后调用：清空等待中的 Native -> H5 回调，防止旧请求挂死 */
  resetPending(): void {
    this.completers.clear()
  }

  registerHandler(handlerName: string, handler: JsBridgeHandler): void {
    this.handlers.set(handlerName, handler)
  }

  unregisterHandler(handlerName: string): void {
    this.handlers.delete(handlerName)
  }

  hasHandler(handlerName: string): boolean {
    return this.handlers.has(handlerName)
  }

  /**
   * Native -> JS 调用 H5 注册的 handler
   */
  async callHandler<T = unknown>(handlerName: string, data?: unknown): Promise<T> {
    const message: JsBridgeMessage = {
      action: handlerName,
      ...(data !== undefined ? { data } : {}),
      id: this.nextId++,
      type: 'request',
      resolved: false,
      rejected: false
    }

    const promise = new Promise<T>((resolve, reject) => {
      this.completers.set(message.id, {
        resolve: resolve as (value: unknown) => void,
        reject
      })
    })

    this.onEvent?.({
      kind: 'request',
      direction: 'out',
      action: handlerName,
      data,
      message
    })

    this.postMessage(message)
    return promise
  }

  /**
   * 处理 H5 通过 window.FlutterWebView.postMessage 发来的消息
   */
  onMessageReceived(messageString: string): void {
    let message: JsBridgeMessage
    try {
      const decodeString = decodeURIComponent(messageString)
      message = JSON.parse(decodeString)
    } catch {
      return
    }

    if (message.type === 'request') {
      this.onEvent?.({
        kind: 'request',
        direction: 'in',
        action: message.action,
        data: message.data,
        message
      })
      void this.senderCall(message)
    }
    if (message.type === 'response') {
      this.onEvent?.({
        kind: 'response',
        direction: 'in',
        action: message.action,
        data: message.data,
        message
      })
      this.receiverCallResponse(message)
    }
  }

  private postMessage(message: JsBridgeMessage): void {
    const jsonString = JSON.stringify(message)
    const encodeString = encodeURIComponent(jsonString)
    // webview 正在加载/刷新时 executeJavaScript 会抛「must be attached ... dom-ready」，
    // 以前没接住就成了未捕获异常，回包直接丢失。这里吞掉即可：H5 会在 ready 后重发请求。
    try {
      const result = this.executor(`WebViewJSBridge.onMessageReceived("${encodeString}")`)
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        void (result as Promise<unknown>).catch(() => {})
      }
    } catch {
      // 忽略：webview 尚未就绪
    }
  }

  private receiverCallResponse(message: JsBridgeMessage): void {
    const completer = this.completers.get(message.id)
    if (!completer) return
    if (message.resolved) {
      completer.resolve(message.data)
    }
    if (message.rejected) {
      completer.reject(message.data ?? 'unknown error')
    }
    this.completers.delete(message.id)
  }

  private async senderCall(message: JsBridgeMessage): Promise<void> {
    const handlerName = message.action
    const handler = this.handlers.get(handlerName)

    let response: JsBridgeMessage

    if (handler) {
      try {
        const data = await handler(message.data)
        response = {
          action: handlerName,
          ...(data !== undefined ? { data } : {}),
          id: message.id,
          type: 'response',
          resolved: true,
          rejected: false
        }
      } catch (err) {
        response = {
          action: handlerName,
          data: String(err),
          id: message.id,
          type: 'response',
          resolved: false,
          rejected: true
        }
      }
    } else {
      response = {
        action: handlerName,
        data: `handler name -> ${handlerName} can't find!!!`,
        id: message.id,
        type: 'response',
        resolved: false,
        rejected: true
      }
    }

    this.onEvent?.({
      kind: 'response',
      direction: 'out',
      action: handlerName,
      data: response.data,
      message: response
    })

    this.postMessage(response)
  }
}

export type { WebviewTag }