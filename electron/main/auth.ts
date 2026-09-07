import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

interface AuthStore {
  token: string
  refreshToken: string
  expireTime: number
  userID: string
  loginTime: string
  /** 钱包 token（页面 getAuth 的 token 字段） */
  walletToken: string
  secretKey: string
  kbitToken: string
  chatToken: string
}

const defaults: AuthStore = {
  token: '',
  refreshToken: '',
  expireTime: 0,
  userID: '',
  loginTime: '',
  walletToken: '',
  secretKey: '',
  kbitToken: '',
  chatToken: ''
}

/** 页面 getAuth 期望的 token 负载 */
export interface AuthTokenPayload {
  token: string
  secretKey: string
  kbitToken: string
  chatToken: string
}

function getStorePath(): string {
  const dir = join(app.getPath('userData'), 'auth')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'auth.json')
}

function loadStore(): AuthStore {
  try {
    const path = getStorePath()
    if (existsSync(path)) {
      return { ...defaults, ...JSON.parse(readFileSync(path, 'utf-8')) }
    }
  } catch (e) {
    console.error('[Auth] 读取存储失败:', e)
  }
  return { ...defaults }
}

function saveStore(data: AuthStore): void {
  try {
    writeFileSync(getStorePath(), JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error('[Auth] 写入存储失败:', e)
  }
}

export function saveToken(data: {
  token: string
  refreshToken: string
  expireTime: number
  userID: string
  walletToken?: string
  secretKey?: string
  kbitToken?: string
  chatToken?: string
}) {
  const store = loadStore()
  store.token = data.token
  store.refreshToken = data.refreshToken
  const nowSec = Math.floor(Date.now() / 1000)
  // 如果 expireTime 是相对秒数（如 7776000），换算为绝对秒级时间戳
  store.expireTime = data.expireTime > nowSec ? data.expireTime : nowSec + (data.expireTime || 7776000)
  store.userID = data.userID
  store.loginTime = new Date().toISOString()
  store.walletToken = data.walletToken ?? ''
  store.secretKey = data.secretKey ?? ''
  store.kbitToken = data.kbitToken ?? ''
  store.chatToken = data.chatToken ?? data.token ?? ''
  saveStore(store)
}

export function getAuthTokens(): AuthTokenPayload {
  const store = loadStore()
  return {
    token: store.walletToken || store.token,
    secretKey: store.secretKey,
    kbitToken: store.kbitToken,
    chatToken: store.chatToken || store.token
  }
}

export function getToken(): string {
  const store = loadStore()
  return store.token || store.chatToken || store.walletToken
}

export function getUserID(): string {
  return loadStore().userID
}

export function isTokenValid(): boolean {
  const store = loadStore()
  // 只要本地存储着 token，直接允许进入页面，过期或错误由运行时请求时捕获强制退出
  return !!(store.token || store.chatToken || store.walletToken)
}

export function clearToken() {
  saveStore({ ...defaults })
}

export function getAuthInfo(): AuthStore {
  return loadStore()
}
