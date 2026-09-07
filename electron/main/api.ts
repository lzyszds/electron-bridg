import { createHash } from 'node:crypto'
import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { v4 as uuidv4 } from 'uuid'
import pkg from 'node-machine-id'
const { machineIdSync } = pkg
import { app } from 'electron'
import { loadConfig } from './config'
import { getProxyAgent } from './proxy'

let cachedMachineId = ''

function getMachineId(): string {
  if (!cachedMachineId) {
    try {
      cachedMachineId = machineIdSync()
    } catch {
      cachedMachineId = 'unknown-device-id'
    }
  }
  return cachedMachineId
}

/** 不走 token 鉴权的 axios 实例（登录用） */
const requestSkipToken: AxiosInstance = axios.create({
  timeout: 15000,
  proxy: false
})

requestSkipToken.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const appConfig = loadConfig()
  config.baseURL = appConfig.apiBaseUrl || appConfig.walletUrl
  config.headers = config.headers ?? {}
  config.headers['operationID'] = uuidv4()
  config.headers['Version'] = 'android-1.0.0'
  config.headers['Terminal-Version'] = '1.0.0'
  config.headers['AppType'] = 'QQLink'
  config.headers['DeviceId'] = getMachineId()
  config.headers['Accept-Language'] = 'zh-CN'
  const agent = getProxyAgent()
  if (agent) {
    config.httpsAgent = agent
    config.httpAgent = agent
  }

  // 打印请求日志
  const sanitized = config.data && typeof config.data === 'object'
    ? { ...config.data, password: config.data.password ? '******' : undefined }
    : config.data
  console.log(`[API Request] POST ${config.baseURL}${config.url}`)
  console.log(`[API Request Data]`, JSON.stringify(sanitized))

  return config
})

requestSkipToken.interceptors.response.use(
  (response) => {
    console.log(`[API Response] POST ${response.config.baseURL}${response.config.url} -> Status: ${response.status}`)
    console.log(`[API Response Data]`, JSON.stringify(response.data))
    return response
  },
  (error) => {
    const respData = error?.response?.data
    console.error(`[API Error] POST ${error?.config?.baseURL}${error?.config?.url} -> Status: ${error?.response?.status || 'No Response'}, Message: ${error.message}`)
    if (respData) {
      console.error(`[API Error Data]`, JSON.stringify(respData))
    }
    return Promise.reject(error)
  }
)

export interface LoginParams {
  email?: string
  password: string
  emailCode?: string
  googleCode?: string
}

export interface LoginResult {
  errCode: number
  errMsg: string
  errDlt: string
  data: {
    token: string
    refreshToken: string
    expireTime: number
    userID: string
    walletToken?: string
    secretKey?: string
    kbitToken?: string
    chatToken?: string
    [key: string]: unknown
  }
}

export async function login(params: LoginParams): Promise<LoginResult> {
  const body: Record<string, unknown> = {
    email: params.email ?? '',
    account: params.email ?? '',
    password: createHash('md5').update(params.password).digest('hex'),
    platform: 2,
    areaCode: '+86',
    version: 'android-1.0.0',
    deviceID: getMachineId(),
    emailCode: '666666',
    deviceType: 'phone'
  }

  if (params.emailCode) body.emailCode = params.emailCode
  if (params.googleCode) body.googleCode = params.googleCode

  let response: any
  try {
    response = await requestSkipToken.post<any>('/account/login', body)
  } catch (err: any) {
    if (err?.response?.status === 404) {
      console.log('[API] /account/login 返回 404，降级尝试 /v1/user/login...')
      response = await requestSkipToken.post<any>('/v1/user/login', body)
    } else {
      throw err
    }
  }
  const raw = response.data ?? {}

  // 统一规整兼容大驼峰/小驼峰
  const errCode = raw.errCode ?? raw.ErrCode ?? raw.code ?? (raw.data || raw.ResData ? 0 : -1)
  const errMsg = raw.errMsg ?? raw.ErrMsg ?? raw.msg ?? raw.message ?? (errCode === 0 ? '' : '未知错误')
  const errDlt = raw.errDlt ?? raw.ErrDlt ?? ''
  const data = raw.data ?? raw.ResData ?? {}

  return {
    errCode,
    errMsg,
    errDlt,
    data
  }
}

export { getMachineId }
