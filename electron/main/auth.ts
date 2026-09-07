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
  store.expireTime = data.expireTime
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
    token: store.walletToken,
    secretKey: store.secretKey,
    kbitToken: store.kbitToken,
    chatToken: store.chatToken
  }
}

export function getToken(): string {
  return loadStore().token
}

export function getUserID(): string {
  return loadStore().userID
}

export function isTokenValid(): boolean {
  const store = loadStore()
  return !!store.token && Date.now() / 1000 < store.expireTime
}

export function clearToken() {
  saveStore({ ...defaults })
}

export function getAuthInfo(): AuthStore {
  return loadStore()
}
