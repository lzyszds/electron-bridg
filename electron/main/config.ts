import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

export interface AppConfig {
  /** H5 镜像页面地址 */
  webviewUrl: string
  /** 业务接口服务器地址（登录 API） */
  apiBaseUrl: string
  /** 钱包接口服务器地址（发送邮箱验证码等） */
  walletUrl: string
  /** HTTP/HTTPS 代理 */
  proxy: {
    enabled: boolean
    url: string
  }
}

export const DEFAULT_CONFIG: AppConfig = {
  webviewUrl: 'https://test.qqlink.info/zh-hans/financial/usStocks?safeArea=50&vconsole=yes',
  apiBaseUrl: 'https://chat.qqlink.live/chat',
  walletUrl: 'https://api.wallet8.top',
  proxy: {
    enabled: true,
    url: 'http://127.0.0.1:7890'
  }
}

let configPath = ''
let cached: AppConfig | null = null

function getPath(): string {
  if (!configPath) {
    configPath = join(app.getPath('userData'), 'app-config.json')
  }
  return configPath
}

function merge(base: AppConfig, patch: Partial<AppConfig>): AppConfig {
  return {
    webviewUrl: patch.webviewUrl ?? base.webviewUrl,
    apiBaseUrl: patch.apiBaseUrl ?? base.apiBaseUrl,
    walletUrl: patch.walletUrl ?? base.walletUrl,
    proxy: { ...base.proxy, ...patch.proxy }
  }
}

export function loadConfig(): AppConfig {
  if (cached) return cached
  try {
    if (existsSync(getPath())) {
      const raw = JSON.parse(readFileSync(getPath(), 'utf-8'))
      cached = merge(DEFAULT_CONFIG, raw)
    } else {
      cached = { ...DEFAULT_CONFIG }
    }
  } catch (e) {
    console.error('[Config] 读取失败，使用默认配置:', e)
    cached = { ...DEFAULT_CONFIG }
  }
  return cached
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  cached = merge(loadConfig(), patch)
  try {
    writeFileSync(getPath(), JSON.stringify(cached, null, 2), 'utf-8')
  } catch (e) {
    console.error('[Config] 保存失败:', e)
  }
  return cached
}
