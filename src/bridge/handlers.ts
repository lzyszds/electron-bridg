import type { WebviewTag } from 'electron'
import { JsBridge } from './jsbridge'
import type { BridgeConfig } from './types'
import { getDeviceProfile } from './device-profiles'

export interface HandlerDeps {
  /** 获取当前 webview 实例 */
  getWebview: () => WebviewTag | null
  /** 读取最新桥接配置 */
  getConfig: () => BridgeConfig
  /** 记录系统日志 */
  log: (message: string, detail?: unknown) => void
}

function extractUrl(data: unknown): string | undefined {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (typeof obj.url === 'string') return obj.url
    if (obj.data && typeof obj.data === 'object') {
      const inner = obj.data as Record<string, unknown>
      if (typeof inner.url === 'string') return inner.url
    }
  }
  return undefined
}

function resolvePlatform(config: BridgeConfig): 'android' | 'ios' {
  if (config.auth.platform !== 'auto') return config.auth.platform
  const device = getDeviceProfile(config.deviceId)
  return /iphone|ios/i.test(device.name) ? 'ios' : 'android'
}

function buildAuthData(config: BridgeConfig): Record<string, unknown> {
  const { secretKey, token, chatToken, imToken } = config.auth
  return { secretKey, token, chatToken, imToken }
}

/**
 * 注册全部桥接 handler，复刻 Flutter 端 JsBridgeController.initRegisiter()
 * 简单能力真实实现，依赖 Flutter 原生库的能力（IM/支付/钱包）返回可配置 mock。
 */
export function registerHandlers(bridge: JsBridge, deps: HandlerDeps): void {
  const { getWebview, getConfig, log } = deps

  const mock = (name: string, handler?: (data: unknown) => unknown) => {
    bridge.registerHandler(name, async (data) => {
      log(`[mock] ${name}`, data)
      return handler ? handler(data) : undefined
    })
  }

  // 返回上一页
  bridge.registerHandler('back', async () => {
    const wv = getWebview()
    if (wv && wv.canGoBack()) {
      wv.goBack()
    }
  })

  // 外部打开链接
  bridge.registerHandler('launchUrl', async (data) => {
    const url = extractUrl(data)
    if (url) {
      log(`[launchUrl] ${url}`)
      await window.bridge.openExternal(url)
    }
  })

  // 支付验证（mock 返回成功）
  bridge.registerHandler('goPayment', async (data) => {
    log('[goPayment]', data)
    return {
      action: 'VERIFY_SUCCESS',
      msg: '',
      data: {
        password: 'mock-pwd-md5',
        coinSymbol: '',
        chainSymbol: '',
        emailCode: '',
        googleCode: ''
      }
    }
  })

  // 上传图片（打开文件选择，返回本地路径）
  bridge.registerHandler('uploadImage', async (data) => {
    const path = await window.bridge.selectFile(['png', 'jpg', 'jpeg', 'gif', 'webp'])
    log(`[uploadImage] ${path ?? 'cancelled'}`, data)
    return { action: 'uploadImage', msg: '', data: path ?? '' }
  })

  // 选择图片上传
  bridge.registerHandler('selectImage', async (data) => {
    const path = await window.bridge.selectFile(['png', 'jpg', 'jpeg', 'gif', 'webp'])
    log(`[selectImage] ${path ?? 'cancelled'}`, data)
    return path ?? ''
  })

  // 选择文件
  bridge.registerHandler('selectFile', async (data) => {
    let allowList: string[] | undefined
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>
      if (Array.isArray(obj.allowList)) allowList = obj.allowList as string[]
    }
    const path = await window.bridge.selectFile(allowList)
    log(`[selectFile] ${path ?? 'cancelled'}`, data)
    return path
  })

  // 刷新 token
  bridge.registerHandler('refreshToken', async (data) => {
    log('[refreshToken]', data)
    return { data: buildAuthData(getConfig()) }
  })

  // 获取认证信息
  bridge.registerHandler('getAuth', async (data) => {
    log('[getAuth]', data)
    return { data: buildAuthData(getConfig()) }
  })

  // 获取初始化数据
  bridge.registerHandler('getInitData', async () => {
    const config = getConfig()
    const payload = {
      userID: config.auth.userID,
      platform: resolvePlatform(config),
      groupID: config.auth.groupID
    }
    log('[getInitData]', payload)
    return { data: payload }
  })

  // 跳转聊天（mock）
  mock('toChat')

  // 获取好友信息列表（mock 空列表）
  bridge.registerHandler('getFriendInfoList', async () => {
    log('[getFriendInfoList] -> []')
    return []
  })

  // 打开文件（mock）
  mock('openFile')

  // 保存数据（electron-store）
  bridge.registerHandler('saveData', async (data) => {
    if (data && typeof data === 'object') {
      const obj = data as { key?: unknown; value?: unknown }
      if (obj.key !== undefined) {
        await window.electronStore.set(String(obj.key), obj.value)
        log('[saveData]', { key: obj.key, value: obj.value })
        return true
      }
    }
    return false
  })

  // 读取数据（electron-store）
  bridge.registerHandler('getData', async (data) => {
    if (data && typeof data === 'object') {
      const obj = data as { key?: unknown }
      if (obj.key !== undefined) {
        const res = await window.electronStore.get(String(obj.key))
        log('[getData]', { key: obj.key, value: res })
        return res
      }
    }
    return null
  })

  // 页面跳转：ext=true 外部打开，否则 webview 内导航
  bridge.registerHandler('toPage', async (data) => {
    log('[toPage]', data)
    if (data && typeof data === 'object') {
      const obj = data as { url?: unknown; ext?: unknown }
      const url = typeof obj.url === 'string' ? obj.url : ''
      if (url) {
        if (obj.ext === true) {
          await window.bridge.openExternal(url)
        } else if (/^https?:\/\//i.test(url)) {
          getWebview()?.loadURL(url)
        }
        return true
      }
    }
    return false
  })

  // 以下能力依赖 Flutter 内部路由/原生库，统一 mock
  mock('toScan')
  mock('toKeepBit')
  mock('toUsStocks')
  mock('toQuickCash')
  mock('startWs')
  mock('toVipAddress')
  mock('toCallCharges')
  mock('toContractEscrow')
  mock('toBankCard')
  mock('goKyc')
  mock('toServiceWebview')
  mock('refreshWalletCard')
  mock('settings')

  // HTTP 代理：主进程转发（无 CORS）
  bridge.registerHandler('proxy', async (data) => {
    log('[proxy]', data)
    const obj = (data ?? {}) as {
      url?: unknown
      method?: unknown
      params?: Record<string, unknown>
      header?: Record<string, string>
      body?: unknown
    }
    if (typeof obj.url !== 'string' || typeof obj.method !== 'string') return null
    const res = (await window.bridge.httpRequest({
      url: obj.url,
      method: obj.method,
      params: obj.params,
      header: obj.header,
      body: obj.body
    })) as { status: number; data: unknown }
    return res?.data
  })

  // AppsFlyer 埋点（仅记录）
  bridge.registerHandler('appsflyerLogEvent', async (data) => {
    log('[appsflyerLogEvent]', data)
    return false
  })

  // 美股订阅（mock）
  bridge.registerHandler('usStockPublic', async (data) => {
    log('[usStockPublic]', data)
    return true
  })

  // 获取公钥
  bridge.registerHandler('pubKey', async () => {
    const key = getConfig().auth.pubKey
    log(`[pubKey] ${key ? 'return key' : 'empty'}`)
    return key
  })

  // 保存图片
  bridge.registerHandler('saveImage', async (data) => {
    log('[saveImage]', data)
    const obj = (data ?? {}) as {
      base64?: string
      blob?: number[]
      name?: string
    }
    if (obj.base64 || obj.blob) {
      await window.bridge.saveImage({
        base64: obj.base64,
        blob: obj.blob,
        name: obj.name
      })
    }
  })
}