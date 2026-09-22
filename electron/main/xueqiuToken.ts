/**
 * 雪球 OAuth token：H5 走 proxy 请求雪球接口时，Cookie 里的 xq_a_token
 * 常为空或字面量 null，由宿主统一补齐。
 *
 * 对齐移动端 qqlink_flutter/lib/utils/xueqiu_token.dart
 * 与 PC 端 qqlink_im_pc/electron/network/xueqiuToken.ts。
 */
import { getMachineId } from './api'

const TOKEN_URL = 'https://api.xueqiu.com/provider/oauth/token'
const CLIENT_ID = 'IVUeiLjVBA'
const CLIENT_SECRET = 'kf70EbdBk4ZvVOfBk0e9Bb'

export interface XueqiuTokenPayload {
  access_token: string
  expires_in: number
}

let cached: XueqiuTokenPayload | null = null
let expiresAt = 0
let inflight: Promise<XueqiuTokenPayload> | null = null

export function isXueqiuHost(host: string): boolean {
  return host.toLowerCase().endsWith('xueqiu.com')
}

export function isXueqiuTokenEndpoint(url: URL): boolean {
  return isXueqiuHost(url.hostname) && url.pathname.includes('/provider/oauth/token')
}

async function fetchAccessToken(): Promise<XueqiuTokenPayload> {
  const deviceUuid = getMachineId().replace(/-/g, '')
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    device_uuid: deviceUuid,
    grant_type: 'password',
    is_register: '0',
    type: '2',
    version: '4.49'
  }).toString()

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Host: 'api.xueqiu.com',
      'User-Agent': 'Snowball iPhone 4.49',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })

  const data = (await res.json()) as {
    access_token?: string
    expires_in?: number | string
    error_description?: string
    error_code?: string
  }

  if (!res.ok || typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error(
      data.error_description || `xueqiu access_token missing (HTTP ${res.status})`
    )
  }

  const expiresIn =
    (typeof data.expires_in === 'number'
      ? Math.trunc(data.expires_in)
      : Number.parseInt(String(data.expires_in ?? ''), 10)) || 3600

  cached = { access_token: data.access_token, expires_in: expiresIn }
  expiresAt = Date.now() + (expiresIn > 120 ? expiresIn - 60 : expiresIn) * 1000
  return cached
}

export function getXueqiuTokenPayload(): Promise<XueqiuTokenPayload> {
  if (cached && Date.now() < expiresAt) return Promise.resolve(cached)
  if (inflight) return inflight
  inflight = fetchAccessToken()
    .catch((e: unknown) => {
      console.warn('[xueqiu] 获取 access_token 失败:', e)
      throw e
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export async function getXueqiuAccessToken(): Promise<string> {
  const payload = await getXueqiuTokenPayload()
  return payload.access_token
}

function cookieHeaderKey(headers: Record<string, string>): string | null {
  return Object.keys(headers).find((k) => k.toLowerCase() === 'cookie') ?? null
}

function needsToken(cookie: string): boolean {
  const match = /xq_a_token=([^;]*)/i.exec(cookie)
  if (!match) return true
  const value = (match[1] ?? '').trim()
  return !value || value === 'null'
}

function injectToken(cookie: string, token: string): string {
  const pattern = /xq_a_token=([^;]*)/i
  if (pattern.test(cookie)) return cookie.replace(pattern, `xq_a_token=${token}`)
  const trimmed = cookie.trim()
  if (!trimmed) return `xq_a_token=${token};`
  return `${trimmed}${trimmed.endsWith(';') ? '' : ';'} xq_a_token=${token};`
}

/**
 * 雪球域请求前补齐 Cookie 中的 xq_a_token。
 * token 接口本身不处理（由宿主按正确表单重放）。
 */
export async function patchXueqiuHeaders(
  url: URL,
  headers: Record<string, string>
): Promise<Record<string, string>> {
  if (!isXueqiuHost(url.hostname) || isXueqiuTokenEndpoint(url)) return headers

  const key = cookieHeaderKey(headers)
  const rawCookie = key ? headers[key] ?? '' : ''
  if (!needsToken(rawCookie)) return headers

  try {
    const token = await getXueqiuAccessToken()
    if (key) {
      return { ...headers, [key]: injectToken(rawCookie, token) }
    }
    return { ...headers, Cookie: `xq_a_token=${token};` }
  } catch {
    return headers
  }
}
