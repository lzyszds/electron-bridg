import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { loadConfig, type EnvMode } from './config'

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
  walletToken?: string
  secretKey: string
  kbitToken: string
  chatToken: string
}

function resolveEnv(env?: EnvMode): EnvMode {
  return env || loadConfig().envMode || 'prod'
}

function getStorePath(env?: EnvMode): string {
  const currentEnv = resolveEnv(env)
  const dir = join(app.getPath('userData'), 'auth')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const envPath = join(dir, `auth_${currentEnv}.json`)
  const legacyPath = join(dir, 'auth.json')

  // 兼容迁移：如果是正式环境且 auth_prod.json 尚不存在，但存在旧的 auth.json，则自动迁移
  if (currentEnv === 'prod' && !existsSync(envPath) && existsSync(legacyPath)) {
    try {
      const oldData = readFileSync(legacyPath, 'utf-8')
      writeFileSync(envPath, oldData, 'utf-8')
    } catch {}
  }

  return envPath
}

function loadStore(env?: EnvMode): AuthStore {
  try {
    const path = getStorePath(env)
    if (existsSync(path)) {
      const store: AuthStore = { ...defaults, ...JSON.parse(readFileSync(path, 'utf-8')) }
      // 如果当前 env 的 store 缺少有效 token，检查旧版 legacy auth.json 并自动回填
      if (!store.token && !store.chatToken && !store.walletToken) {
        const legacyPath = join(app.getPath('userData'), 'auth', 'auth.json')
        if (existsSync(legacyPath)) {
          try {
            const legacyStore = JSON.parse(readFileSync(legacyPath, 'utf-8'))
            if (legacyStore.token || legacyStore.chatToken || legacyStore.walletToken) {
              const merged: AuthStore = { ...defaults, ...legacyStore }
              saveStore(merged, env)
              return merged
            }
          } catch {}
        }
      }
      return store
    }
  } catch (e) {
    console.error(`[Auth] 读取存储失败 (${resolveEnv(env)}):`, e)
  }
  return { ...defaults }
}

function saveStore(data: AuthStore, env?: EnvMode): void {
  try {
    writeFileSync(getStorePath(env), JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error(`[Auth] 写入存储失败 (${resolveEnv(env)}):`, e)
  }
}

export function saveToken(
  data: {
    token: string
    refreshToken: string
    expireTime: number
    userID: string
    walletToken?: string
    secretKey?: string
    kbitToken?: string
    chatToken?: string
  },
  env?: EnvMode
) {
  const store = loadStore(env)
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
  saveStore(store, env)
}

export function getAuthTokens(env?: EnvMode): AuthTokenPayload {
  const store = loadStore(env)
  return {
    token: store.walletToken || store.token,
    walletToken: store.walletToken || store.token,
    secretKey: store.secretKey,
    kbitToken: store.kbitToken,
    chatToken: store.chatToken || store.token
  }
}

export function getToken(env?: EnvMode): string {
  const store = loadStore(env)
  return store.token || store.chatToken || store.walletToken
}

export function getUserID(env?: EnvMode): string {
  return loadStore(env).userID
}

export function isTokenValid(env?: EnvMode): boolean {
  const store = loadStore(env)
  // 只要本地存储着 token，直接允许进入页面，过期或错误由运行时请求时捕获强制退出
  return !!(store.token || store.chatToken || store.walletToken)
}

export function clearToken(env?: EnvMode) {
  saveStore({ ...defaults }, env)
}

export function getAuthInfo(env?: EnvMode): AuthStore {
  return loadStore(env)
}
