import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

export type EnvMode = 'prod' | 'test'

export interface EnvPreset {
  mode: EnvMode
  label: string
  tag: string
  h5BaseUrl: string
  walletUrl: string
  apiBaseUrl: string
  nodeConfigUrl: string
  nodeConfigContent: string
}

export const ENV_PRESETS: Record<EnvMode, EnvPreset> = {
  prod: {
    mode: 'prod',
    label: '正式环境 (main)',
    tag: 'PROD',
    h5BaseUrl: 'https://module.qqlink.info',
    walletUrl: 'https://api.qqlink.live',
    apiBaseUrl: 'https://chat.qqlink.live/chat',
    nodeConfigUrl: 'https://qqlink.obs.ap-southeast-3.myhuaweicloud.com/configQQLink.txt',
    nodeConfigContent: 'qqlink.live,qqlink.live\nqqlink.xin,qqlink.xin'
  },
  test: {
    mode: 'test',
    label: '测试环境 (test)',
    tag: 'TEST',
    h5BaseUrl: 'https://module.qqlink.buzz',
    walletUrl: 'https://api.qqlink.buzz',
    apiBaseUrl: 'https://chat.qqlink.buzz/chat',
    nodeConfigUrl: 'https://qqlink.obs.ap-southeast-3.myhuaweicloud.com/configQQLinkTest.txt',
    nodeConfigContent: 'qqlink.buzz,qqlink.buzz'
  }
}

export interface AppConfig {
  /** 运行环境模式：prod 正式环境 (main) | test 测试环境全桥接 (test) */
  envMode: EnvMode
  /** H5 镜像基础域名（如 https://module.qqlink.info 或 https://module.qqlink.buzz 或 http://localhost:3000） */
  h5BaseUrl: string
  /** 默认/最后访问的完整 URL */
  webviewUrl: string
  /** 默认/最后选中的模块 ID */
  lastModuleId?: string
  /** 语言前缀 */
  locale: string
  /** 是否附带调试参数 safeArea=50&vconsole=yes */
  withDebugParams: boolean
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
  envMode: 'prod',
  h5BaseUrl: 'https://module.qqlink.info',
  webviewUrl: 'https://module.qqlink.info/zh-hans/financial/usStocks?safeArea=50&vconsole=yes',
  lastModuleId: 'financial-usStocks',
  locale: 'zh-hans',
  withDebugParams: true,
  apiBaseUrl: 'https://chat.qqlink.live/chat',
  walletUrl: 'https://api.qqlink.live',
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
  const envMode = patch.envMode ?? base.envMode ?? 'prod'
  const preset = ENV_PRESETS[envMode] || ENV_PRESETS.prod

  // 如果发生了环境模式改变，且 patch 中未显式指定 h5BaseUrl / walletUrl / apiBaseUrl，自动采用对应环境预设
  const isModeChanged = patch.envMode && patch.envMode !== base.envMode
  const defaultH5Base = isModeChanged ? preset.h5BaseUrl : (base.h5BaseUrl ?? preset.h5BaseUrl)
  const defaultWallet = isModeChanged ? preset.walletUrl : (base.walletUrl ?? preset.walletUrl)
  const defaultApi = isModeChanged ? preset.apiBaseUrl : (base.apiBaseUrl ?? preset.apiBaseUrl)

  return {
    envMode,
    h5BaseUrl: patch.h5BaseUrl ?? defaultH5Base,
    webviewUrl: patch.webviewUrl ?? base.webviewUrl,
    lastModuleId: patch.lastModuleId ?? base.lastModuleId ?? 'financial-usStocks',
    locale: patch.locale ?? base.locale ?? 'zh-hans',
    withDebugParams: patch.withDebugParams ?? base.withDebugParams ?? true,
    apiBaseUrl: patch.apiBaseUrl ?? defaultApi,
    walletUrl: patch.walletUrl ?? defaultWallet,
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
