import { createHash } from 'node:crypto'
import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { v4 as uuidv4 } from 'uuid'
import pkg from 'node-machine-id'
const { machineIdSync } = pkg
import { app } from 'electron'
import { loadConfig, ENV_PRESETS, type EnvMode } from './config'
import { getProxyAgent } from './proxy'
import {
  DEFAULT_VERIFY_TYPES,
  ERR_NEED_SECURITY_VERIFY,
  parseVerifyRequirement,
  type VerifyRequirement
} from '../shared/verify'

let cachedMachineId = ''

/** 宽松转数字：兼容服务端把错误码返回成字符串的情况，无法转换时返回 undefined */
function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/**
 * 生成与 Flutter 端一致的设备 ID。
 *
 * Flutter 端（packages/common/lib/src/utils/device_info_helper.dart）的规则是：
 *   1. 拼出硬件标识串（Android 用 ANDROID_ID + 品牌/型号/制造商等）
 *   2. 对字节做两轮滚动哈希（hash1 乘 31、hash2 乘 37，均 & 0xFFFFFFFF）
 *   3. 拼成 `phone_<hash1:8位hex>_<hash2:8位hex>`，超 32 字符则截断
 *
 * 服务端按这个格式校验设备 ID：既不是 phone_ 前缀、长度又超过 32 的，
 * 一律判「设备ID无效或缺失」(ErrCode 50)。此处必须对齐，
 * 直接用 node-machine-id 的 64 位裸十六进制会全部被拒。
 */
function buildPhoneDeviceId(identifier: string): string {
  const bytes = Buffer.from(identifier, 'utf8')
  let hash1 = 0
  let hash2 = 0
  for (const byte of bytes) {
    hash1 = ((hash1 * 31) + byte) & 0xffffffff
    hash2 = ((hash2 * 37) + byte) & 0xffffffff
  }
  const hashedId1 = (hash1 >>> 0).toString(16).padStart(8, '0')
  const hashedId2 = (hash2 >>> 0).toString(16).padStart(8, '0')
  const finalDeviceId = `phone_${hashedId1}_${hashedId2}`
  return finalDeviceId.length > 32 ? finalDeviceId.substring(0, 32) : finalDeviceId
}

function getMachineId(): string {
  if (!cachedMachineId) {
    try {
      // 桌面端无 ANDROID_ID，用机器唯一标识喂进同一套哈希，
      // 保证「同一台机器稳定、格式与手机端一致」
      cachedMachineId = buildPhoneDeviceId(`macos_${machineIdSync()}`)
    } catch {
      cachedMachineId = 'phone_unknown'
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
  if (!config.baseURL) {
    config.baseURL = appConfig.apiBaseUrl || appConfig.walletUrl
  }
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
  envMode?: EnvMode
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
  /** errCode 为 20016 时，服务端要求的安全验证；解析失败时按邮箱验证兜底 */
  verify?: VerifyRequirement
}

export async function login(params: LoginParams): Promise<LoginResult> {
  const cfg = loadConfig()
  const targetEnv = params.envMode || cfg.envMode || 'prod'
  const preset = ENV_PRESETS[targetEnv] || ENV_PRESETS.prod
  const targetBaseUrl = preset.apiBaseUrl || preset.walletUrl

  const body: Record<string, unknown> = {
    email: params.email ?? '',
    account: params.email ?? '',
    password: createHash('md5').update(params.password).digest('hex'),
    platform: 2,
    areaCode: '+86',
    version: 'android-1.0.0',
    deviceID: getMachineId(),
    deviceType: 'phone'
  }

  // 仅在调用方明确提供了验证码时才附带。
  // 这里曾经无条件写死 emailCode: '666666'，导致首次登录（用户还没机会输入验证码）就带上了
  // 一个错误的验证码，服务端会返回「验证码错误」而不是 20016「需要安全验证」，
  // 前端拿不到验证要求，验证码弹窗自然永远弹不出来。
  if (params.emailCode) body.emailCode = params.emailCode
  if (params.googleCode) body.googleCode = params.googleCode

  let response: any
  try {
    response = await requestSkipToken.post<any>('/account/login', body, { baseURL: targetBaseUrl })
  } catch (err: any) {
    if (err?.response?.status === 404) {
      console.log(`[API] /account/login 返回 404，降级尝试 /v1/user/login (${targetBaseUrl})...`)
      response = await requestSkipToken.post<any>('/v1/user/login', body, { baseURL: targetBaseUrl })
    } else {
      throw err
    }
  }
  const raw = response.data ?? {}

  // 统一规整兼容大驼峰/小驼峰；错误码统一收敛成 number，避免服务端返回字符串 "20016" 时判定失效
  const errCode = toNumber(raw.errCode ?? raw.ErrCode ?? raw.code ?? raw.Code)
    ?? (raw.data || raw.ResData ? 0 : -1)
  const errMsg = raw.errMsg ?? raw.ErrMsg ?? raw.msg ?? raw.message ?? (errCode === 0 ? '' : '未知错误')
  const errDlt = raw.errDlt ?? raw.ErrDlt ?? ''
  const data = raw.data ?? raw.ResData ?? {}

  // 服务端要求二次安全验证时，把验证要求结构化透出给渲染进程
  let verify: VerifyRequirement | undefined
  if (errCode === ERR_NEED_SECURITY_VERIFY) {
    const parsed = parseVerifyRequirement(errDlt, params.email ?? '')
    if (parsed) {
      verify = parsed
    } else {
      // 报文里解析不出 verifiys（格式变更/字段缺失）时按邮箱验证兜底，
      // 保证前端仍能弹出验证码窗口而不是直接报「无法解析安全验证信息」
      console.warn('[API] 服务端要求安全验证但 errDlt 未解析出 verifiys，按邮箱验证兜底。errDlt:', errDlt)
      verify = { email: params.email ?? '', verifiys: [...DEFAULT_VERIFY_TYPES] }
    }
  }

  return {
    errCode,
    errMsg,
    errDlt,
    data,
    verify
  }
}

export { getMachineId }
