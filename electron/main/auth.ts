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
  /** 私有 WS(美股订单/持仓) 登录用的 appKey / appSecret，仅内存保存（属于敏感凭证，不落盘） */
  kbitAppKey: string
  kbitAppSecret: string
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
  chatToken: '',
  kbitAppKey: '',
  kbitAppSecret: ''
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
      return withMemorySecrets(store, env)
    }
  } catch (e) {
    console.error(`[Auth] 读取存储失败 (${resolveEnv(env)}):`, e)
  }
  return withMemorySecrets({ ...defaults }, env)
}

// 私有 WS 凭证只在内存里，随进程退出失效，避免敏感 secret 落盘
const memorySecrets: Partial<Record<EnvMode, { kbitAppKey: string; kbitAppSecret: string }>> = {}

function withMemorySecrets(store: AuthStore, env?: EnvMode): AuthStore {
  const mem = memorySecrets[resolveEnv(env)]
  return mem ? { ...store, ...mem } : store
}

/** 登录成功后写入私有 WS 凭证（仅内存） */
/** 读取当前环境的完整登录存储（含 token / walletToken / secretKey 等） */
export function getStore(env?: EnvMode): AuthStore {
  return loadStore(env)
}

/**
 * 单独更新钱包会话（thirdPartyUserTokenRefresh 换来的钱包 token 与其 userSecret）。
 * 只覆盖 walletToken / secretKey，其余登录信息保持不变。
 */
export function saveWalletSession(
  data: { walletToken: string; secretKey?: string },
  env?: EnvMode
): void {
  const store = loadStore(env)
  store.walletToken = data.walletToken
  store.secretKey = data.secretKey ?? store.secretKey
  saveStore(store, env)
}

export function saveKbitAppSecret(data: { kbitAppKey?: string; kbitAppSecret?: string }, env?: EnvMode) {
  if (data.kbitAppSecret) {
    memorySecrets[resolveEnv(env)] = {
      kbitAppKey: data.kbitAppKey ?? '',
      kbitAppSecret: data.kbitAppSecret
    }
  }
}

/** 获取私有 WS 登录凭证；登录响应里没给 secret 时退回持久化的 secretKey */
export function getKbitAppSecret(env?: EnvMode): { kbitAppKey: string; kbitAppSecret: string } {
  const store = withMemorySecrets(loadStore(env), env)
  return {
    kbitAppKey: store.kbitAppKey || loadConfig().usStockWsApiKey,
    kbitAppSecret: store.kbitAppSecret || store.secretKey
  }
}

function saveStore(data: AuthStore, env?: EnvMode): void {
  try {
    const { kbitAppKey, kbitAppSecret, ...persisted } = data
    void kbitAppKey
    void kbitAppSecret
    writeFileSync(getStorePath(env), JSON.stringify(persisted, null, 2), 'utf-8')
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
  const token = store.token || store.chatToken || store.walletToken
  // 没有 token 一律视为未登录
  if (!token) return false
  // 本地有过期时间且已过期：直接判定失效。之前只看「有没有 token」，
  // 过期凭证也会自动进主页，然后每个接口都鉴权失败，表现为「怎么点都不对」。
  // 没有过期时间的旧数据仍然放行，由运行时请求捕获后强制退出。
  if (store.expireTime && store.expireTime * 1000 <= Date.now()) return false
  return true
}

export function clearToken(env?: EnvMode) {
  delete memorySecrets[resolveEnv(env)]
  saveStore({ ...defaults }, env)
}

export function getAuthInfo(env?: EnvMode): AuthStore {
  return loadStore(env)
}
