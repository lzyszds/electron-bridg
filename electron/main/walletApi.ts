import { createCipheriv, publicEncrypt, randomBytes, constants, createHmac } from 'node:crypto'
import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { app } from 'electron'
import { loadConfig } from './config'
import { getMachineId } from './api'
import { getProxyAgent } from './proxy'

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
  pubKeyPromise = axios
    .get(`${walletUrl}/v1/common/getConfig`, {
      timeout: 15000,
      proxy: false,
      httpsAgent: getProxyAgent(),
      httpAgent: getProxyAgent()
    })
    .then((r) => {
      const key = r.data?.ResData?.pubKey
      if (!key) throw new Error('getConfig 未返回 pubKey')
      cachedPubKey = key as string
      return cachedPubKey
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

const walletRequest: AxiosInstance = axios.create({
  timeout: 15000,
  proxy: false
})

walletRequest.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const walletUrl = loadConfig().walletUrl
  config.baseURL = walletUrl
  config.headers = config.headers ?? {}
  config.headers['operationID'] = uuidv4()
  config.headers['Version'] = `1-${app.getVersion()}`
  config.headers['Terminal-Version'] = app.getVersion()
  config.headers['AppType'] = 'QQLink'
  config.headers['DeviceId'] = getMachineId()
  config.headers['Accept-Language'] = 'zh-CN'
  const agent = getProxyAgent()
  if (agent) {
    config.httpsAgent = agent
    config.httpAgent = agent
  }

  if (config.method?.toUpperCase() === 'POST' && config.data != null) {
    const pubKey = await fetchPubKey(walletUrl)
    const rawData =
      typeof config.data === 'string'
        ? (JSON.parse(config.data) as Record<string, unknown>)
        : ({ ...config.data } as Record<string, unknown>)
    config.data = encryptRequestData(rawData, pubKey)
  }

  return config
})

export async function sendEmailCode(params: {
  email: string
  codeType: number
}): Promise<{ errCode?: number; errMsg?: string }> {
  const { data } = await walletRequest.post('/v1/user/sendEmailCode', params)
  return data ?? {}
}
