import { createCipheriv, publicEncrypt, randomBytes, constants } from 'node:crypto'
import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { app } from 'electron'
import { loadConfig } from './config'
import { getMachineId } from './api'
import { getProxyAgent } from './proxy'

let cachedPubKey: string | null = null
let pubKeyPromise: Promise<string> | null = null

function encryptRequestData(data: Record<string, unknown>, publicKeyPem: string) {
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

async function fetchPubKey(walletUrl: string): Promise<string> {
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
