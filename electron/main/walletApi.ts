import { createCipheriv, publicEncrypt, randomBytes, constants, createHmac } from 'node:crypto'
import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { app } from 'electron'
import { loadConfig, type EnvMode } from './config'
import { getMachineId } from './api'
import { getProxyAgent } from './proxy'
import { getAuthTokens, getStore, saveWalletSession } from './auth'

let cachedPubKey: string | null = null
let pubKeyPromise: Promise<string> | null = null

export function encryptRequestData(data: Record<string, unknown>, publicKeyPem: string) {
  const aesKey = randomBytes(32)
  const iv = aesKey.subarray(0, 16)
  const cipher = createCipheriv('aes-256-cbc', aesKey, iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final()
  ])
  const encryptedDataBase64 = encrypted.toString('base64')
  const aesKeyHex = aesKey.toString('hex')
  const encryptedKey = publicEncrypt(
    { key: publicKeyPem, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(aesKeyHex, 'utf8')
  )
  return {
    data: encodeURIComponent(encryptedDataBase64),
    aes_key: encodeURIComponent(encryptedKey.toString('base64'))
  }
}

export async function fetchPubKey(walletUrl: string): Promise<string> {
  if (cachedPubKey) return cachedPubKey
  if (pubKeyPromise) return pubKeyPromise
  const headers = buildWalletHeaders()
  console.log(
    `[Wallet Request Headers] DeviceId=${headers.DeviceId} Deviceld=${headers.Deviceld} platform=${headers.platform} deviceType=${headers.deviceType} Version=${headers.Version} (getConfig 取公钥)`
  )
  pubKeyPromise = axios
    .get(`${walletUrl}/v1/common/getConfig`, {
      timeout: 15000,
      proxy: false,
      httpsAgent: getProxyAgent(),
      httpAgent: getProxyAgent(),
      // 这里必须带上完整的设备/应用头。该接口不带 DeviceId 会被服务端拒绝
      // （报「设备ID无效或缺失」），进而导致整个钱包链路拿不到公钥、所有 POST 全部失败。
      headers
    })
    .then((r) => {
      // 兼容大驼峰/小驼峰，线上返回的是 ResData
      const body = r.data ?? {}
      const key = body.pubKey ?? body.ResData?.pubKey ?? body.data?.pubKey
      if (!key) {
        console.error('[Wallet] getConfig 未返回 pubKey，响应原文:', JSON.stringify(body))
        throw new Error('getConfig 未返回 pubKey')
      }
      cachedPubKey = key as string
      return cachedPubKey
    })
    .catch((err) => {
      console.error(
        `[Wallet] 获取钱包公钥失败 GET ${walletUrl}/v1/common/getConfig ->`,
        err?.response?.status ?? 'No Response',
        err?.message
      )
      if (err?.response?.data !== undefined) {
        console.error('[Wallet] 获取公钥失败响应原文:', JSON.stringify(err.response.data))
      }
      throw err
    })
    .finally(() => {
      pubKeyPromise = null
    })
  return pubKeyPromise
}

/** 从 wallet JWT 解析 userSecret（后端 HMAC 验签用的密钥） */
export function getWalletSignSecret(walletToken?: string, secretKey?: string): string {
  if (walletToken) {
    let raw = walletToken.trim()
    if (raw.toLowerCase().startsWith('bearer ')) {
      raw = raw.slice(7).trim()
    }
    const parts = raw.split('.')
    if (parts.length >= 2) {
      try {
        let payload = parts[1]
        const mod = payload.length % 4
        if (mod > 0) payload += '='.repeat(4 - mod)
        payload = payload.replace(/-/g, '+').replace(/_/g, '/')
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
        const secret = decoded.userSecret || decoded.user_secret
        if (secret) return String(secret)
      } catch {
        // 忽略
      }
    }
  }
  return secretKey || ''
}

/** 解析 JWT payload（失败返回 null） */
function decodeJwtPayload(token?: string): Record<string, unknown> | null {
  if (!token) return null
  let raw = token.trim()
  if (raw.toLowerCase().startsWith('bearer ')) raw = raw.slice(7).trim()
  const parts = raw.split('.')
  if (parts.length < 2) return null
  try {
    let payload = parts[1]
    const mod = payload.length % 4
    if (mod > 0) payload += '='.repeat(4 - mod)
    payload = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

/** 钱包会话缓存：同一 base token 复用刷新结果，避免 H5 并发请求时反复刷新 */
const walletSessionCache = new Map<string, { token: string; secretKey: string }>()

/**
 * 登录拿到的 token 不是钱包 token：用它请求 api.* 会返回「token解析失败-1」。
 * 与 Flutter 打开钱包页一致，先用 thirdPartyUserTokenRefresh 换出钱包 token（其 userSecret 即 HMAC 密钥），
 * 写入 store，并返回给 H5 用于内存态凭据（H5 的 auth 存在内存里，不落 localStorage）。
 */
export async function refreshWalletSession(envMode?: EnvMode): Promise<{ token: string; secretKey: string }> {
  const env = envMode || (loadConfig().envMode || 'prod') as EnvMode
  const store = getStore(env)
  const candidates = Array.from(new Set([store.walletToken, store.token].filter(Boolean))) as string[]
  if (candidates.length === 0) return { token: '', secretKey: '' }
  // 只用第一个候选（优先 walletToken），失败就交给调用方处理
  for (const old of candidates.slice(0, 1)) {
    const payload = decodeJwtPayload(old)
    const userId = payload?.userID ?? payload?.userId ?? store.userID
    if (!userId) continue
    const key = `${env}:${String(userId)}:${old.slice(-12)}`
    const cached = walletSessionCache.get(key)
    if (cached) return cached
    try {
      const resp = await axios.post(
        `${loadConfig().walletUrl}/v1/user/thirdPartyUserTokenRefresh`,
        { tokens: { [String(userId)]: old } },
        {
          headers: { ...buildWalletHeaders(), Authorization: '', 'Kbit-Token': '' },
          timeout: 15000,
          proxy: false
        }
      )
      const body = resp.data as Record<string, any> | undefined
      const resData = body?.ResData ?? body?.resData
      const newTokens = resData?.new_tokens ?? resData?.NewTokens
      const entry = newTokens?.[String(userId)]
      const newToken = entry?.newtoken ?? entry?.newToken ?? entry?.token
      if (typeof newToken === 'string' && newToken) {
        const secret = String(decodeJwtPayload(newToken)?.userSecret ?? '')
        const result = { token: newToken, secretKey: secret }
        saveWalletSession({ walletToken: newToken, secretKey: secret }, env)
        walletSessionCache.set(key, result)
        console.log('[Wallet Session] 已通过 thirdPartyUserTokenRefresh 恢复钱包会话')
        return result
      }
      console.warn('[Wallet Session] 刷新钱包会话无新 token，响应:', JSON.stringify(body)?.slice(0, 300))
    } catch (err: any) {
      console.warn('[Wallet Session] 刷新钱包会话失败:', err?.message || err)
    }
  }
  return { token: '', secretKey: '' }
}

/** 对齐 Flutter 端 WalletDio 签名算法 */
export function generateWalletSignature(params: {
  data?: unknown
  secret: string
}): { timestamp: number; nonce: string; signature: string } {
  const now = Math.floor(Date.now() / 1000)
  const nonce = uuidv4()
  let buffer = ''

  if (params.data && typeof params.data === 'object') {
    const obj = params.data as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    buffer = keys.map((k) => `${obj[k]}`).join('&')
    if (buffer.length > 0) buffer += '&'
  }

  buffer += `${now}&${nonce}`
  const signature = createHmac('sha256', params.secret || '').update(buffer).digest('hex')

  return {
    timestamp: now,
    nonce,
    signature
  }
}

/** 日志脱敏：邮箱保留首字符，其余打码，避免明文邮箱刷屏日志 */
function maskEmail(email: unknown): unknown {
  if (typeof email !== 'string' || !email.includes('@')) return email
  const [name, domain] = email.split('@')
  const head = name.slice(0, 1)
  return `${head}${'*'.repeat(Math.max(name.length - 1, 0))}@${domain}`
}

/** 日志脱敏：剔除密码类字段 */
function sanitizeForLog(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data
  const obj = { ...(data as Record<string, unknown>) }
  for (const key of ['password', 'tradePassword', 'emailCode', 'googleCode']) {
    if (key in obj) obj[key] = '******'
  }
  if ('email' in obj) obj.email = maskEmail(obj.email)
  return obj
}

/**
 * 钱包接口的公共请求头。
 * fetchPubKey 与 walletRequest 拦截器共用同一份，避免两处写法不一致
 * （历史上 fetchPubKey 漏了 DeviceId，导致公钥拿不到、钱包链路整体不可用）。
 *
 * 这里刻意伪装成安卓手机端，对齐登录接口已验证可用的写法
 * （api.ts 中 version: 'android-1.0.0' / deviceType: 'phone'）：
 * 钱包接口若被服务端判为非手机端，会拒绝下发公钥并报「设备ID无效或缺失」。
 */
export function buildWalletHeaders(): Record<string, string> {
  const deviceId = getMachineId()
  const envMode = (loadConfig().envMode || 'prod') as EnvMode
  const tokens = getAuthTokens(envMode)
  const walletToken = tokens.walletToken || tokens.token || ''
  return {
    operationID: uuidv4(),
    // 对齐 Flutter _WalletDioIntercetor：每个钱包请求都带 Authorization: Bearer <walletToken>
    Authorization: walletToken ? `Bearer ${walletToken}` : '',
    // 对齐 Flutter：userAgent 取平台名（android / iphone）
    'User-Agent': 'android',
    AppType: 'QQLink',
    'Accept-Language': 'zh-CN',
    'Terminal-Version': '1.0.0',
    // Flutter 同时下发 DeviceId 与 Deviceld 两个头（后者结尾为小写 L）
    DeviceId: deviceId,
    Deviceld: deviceId,
    Version: 'android-1.0.0',
    // 签名密钥来自 walletToken 内的 userSecret（见 applyWalletSignature）
    'Kbit-Token': `Bearer ${tokens.kbitToken || ''}`
  }
}

/**
 * 为钱包请求注入 HMAC-SHA256 签名头。
 * 逐条对齐 electron/main/index.ts 中桥接 proxy 路径的签名逻辑（该路径已被日志验证可用）：
 *   1. 取签名数据：加密前的明文 body（POST）或 query 参数（GET）
 *   2. 取密钥：优先 walletToken 里的 userSecret（getWalletSignSecret 解析 JWT），退回 secretKey
 *   3. 生成 X-Timestamp / X-Nonce / X-Signature
 * 没有密钥时只告警不中断，保持原有「失败即返回明文」的行为。
 */
function applyWalletSignature(config: InternalAxiosRequestConfig): void {
  if (config.headers?.['X-Signature']) return

  const envMode = (loadConfig().envMode || 'prod') as EnvMode
  const tokens = getAuthTokens(envMode)

  // Flutter genSign: final data = options.data ?? options.queryParameters;
  // 注意 body 此时已被加密成 { data, aes_key } 形态，需取其中的 data(密文) 参与签名 —— 与 Flutter 一致
  // （Flutter 也是在 aes 加密之后才调用 genSign）。
  let signData: unknown = config.data ?? config.params
  if (typeof signData === 'string') {
    try {
      signData = JSON.parse(signData)
    } catch {
      // 非 JSON 字符串保持原样
    }
  }

  const authHeader = config.headers?.['Authorization'] ?? config.headers?.['authorization']
  const secret = getWalletSignSecret(
    (typeof authHeader === 'string' ? authHeader : undefined) || tokens.walletToken || tokens.token,
    tokens.secretKey
  )
  if (!secret) {
    console.warn('[Wallet] 未能提取到 HMAC secretKey，无法生成 X-Signature。tokens:', {
      hasWalletToken: Boolean(tokens.walletToken),
      hasToken: Boolean(tokens.token),
      hasSecretKey: Boolean(tokens.secretKey)
    })
    return
  }

  const signResult = generateWalletSignature({ data: signData, secret })
  config.headers['X-Timestamp'] = String(signResult.timestamp)
  config.headers['X-Nonce'] = signResult.nonce
  config.headers['X-Signature'] = signResult.signature
  console.log(
    `[Wallet Request Sign] X-Signature: ${signResult.signature.slice(0, 16)}... X-Nonce: ${signResult.nonce.slice(0, 8)}...`
  )
}

const walletRequest: AxiosInstance = axios.create({
  timeout: 15000,
  proxy: false
})

walletRequest.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const walletUrl = loadConfig().walletUrl
  config.baseURL = walletUrl
  config.headers = config.headers ?? {}
  for (const [key, value] of Object.entries(buildWalletHeaders())) {
    config.headers[key] = value
  }
  const agent = getProxyAgent()
  if (agent) {
    config.httpsAgent = agent
    config.httpAgent = agent
  }

  // 打印实际发出的身份标识，便于确认手机端伪装是否生效
  console.log(
    `[Wallet Request Headers] DeviceId=${config.headers['DeviceId']} Deviceld=${config.headers['Deviceld']} platform=${config.headers['platform']} deviceType=${config.headers['deviceType']} Version=${config.headers['Version']}`
  )

  const isPost = config.method?.toUpperCase() === 'POST'
  if (isPost && config.data != null) {
    const pubKey = await fetchPubKey(walletUrl)
    const rawData =
      typeof config.data === 'string'
        ? (JSON.parse(config.data) as Record<string, unknown>)
        : ({ ...config.data } as Record<string, unknown>)
    // 打印加密前的明文 body：加密后无法排查，这里是唯一能看清「到底发了什么」的地方
    console.log(`[Wallet Request] POST ${walletUrl}${config.url}`)
    console.log(`[Wallet Request Body(加密前)]`, JSON.stringify(sanitizeForLog(rawData)))
    config.data = encryptRequestData(rawData, pubKey)
  } else {
    console.log(`[Wallet Request] ${config.method?.toUpperCase()} ${walletUrl}${config.url}`)
  }

  // 对齐 Flutter WalletDio.genSign / 桥接 proxy 路径：钱包请求需要 HMAC-SHA256 签名头。
  // 桥接路径（index.ts）对每个钱包请求都注入了 X-Signature/X-Timestamp/X-Nonce，
  // 且日志显示它能正常拿到数据；钱包链路此前完全没有签名，服务端因此拒绝。
  applyWalletSignature(config)

  return config
})

walletRequest.interceptors.response.use(
  (response) => {
    console.log(
      `[Wallet Response] ${response.config.method?.toUpperCase()} ${response.config.baseURL}${response.config.url} -> HTTP ${response.status}`
    )
    console.log(`[Wallet Response Data]`, JSON.stringify(response.data))
    return response
  },
  (error) => {
    const status = error?.response?.status ?? 'No Response'
    const respData = error?.response?.data
    console.error(
      `[Wallet Error] ${error?.config?.method?.toUpperCase()} ${error?.config?.baseURL}${error?.config?.url} -> HTTP ${status}, Message: ${error?.message}`
    )
    if (respData !== undefined) {
      console.error(`[Wallet Error Data]`, JSON.stringify(respData))
    }
    return Promise.reject(error)
  }
)

export async function sendEmailCode(params: {
  email: string
  codeType: number
}): Promise<{ errCode?: number; errMsg?: string }> {
  const { data } = await walletRequest.post('/v1/user/sendEmailCode', params)
  return data ?? {}
}

/**
 * 判断钱包接口响应是否为业务成功。
 * 服务端各接口字段写法不统一（errCode / ErrCode / code / Code），且可能是字符串，
 * 统一宽松判定，避免把真实报错误判成成功、或把成功误判成失败。
 * 返回 null 表示响应里没有任何错误码字段，无法判定。
 */
export function getWalletErrCode(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  const raw = obj.errCode ?? obj.ErrCode ?? obj.code ?? obj.Code
  if (raw === undefined || raw === null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** 提取钱包接口的错误提示文案 */
export function getWalletErrMsg(data: unknown, fallback = '发送验证码失败'): string {
  if (!data || typeof data !== 'object') return fallback
  const obj = data as Record<string, unknown>
  const msg = obj.errMsg ?? obj.ErrMsg ?? obj.errDlt ?? obj.ErrDlt ?? obj.msg ?? obj.message
  return typeof msg === 'string' && msg ? msg : fallback
}
