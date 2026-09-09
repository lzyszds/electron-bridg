interface AuthApi {
  login: (params: {
    email?: string
    password: string
    emailCode?: string
    googleCode?: string
  }, env?: string) => Promise<{
    success: boolean
    data?: { token: string; refreshToken: string; expireTime: number; userID: string }
    errMsg?: string
    errCode?: number
    errDlt?: string
  }>
  sendEmailCode: (params: { email: string; codeType: number }, env?: string) => Promise<{ success: boolean; errMsg?: string }>
  getToken: (env?: string) => Promise<string>
  isLoggedIn: (env?: string) => Promise<boolean>
  getAuthInfo: (env?: string) => Promise<{
    token: string
    refreshToken: string
    expireTime: number
    userID: string
    loginTime: string
    walletToken: string
    secretKey: string
    kbitToken: string
    chatToken: string
  }>
  getAuthTokens: (env?: string) => Promise<{
    token: string
    secretKey: string
    kbitToken: string
    chatToken: string
  }>
  getUserID: (env?: string) => Promise<string>
  logout: (env?: string) => void
}

/** 主进程暴露的配置 API */
interface ConfigApi {
  getConfig: () => Promise<AppConfig>
  setConfig: (patch: Partial<AppConfig>) => Promise<AppConfig>
  onConfigChanged: (callback: (cfg: AppConfig) => void) => () => void
}

interface AppConfig {
  envMode?: 'prod' | 'test'
  webviewUrl: string
  apiBaseUrl: string
  walletUrl: string
  h5BaseUrl: string
  lastModuleId?: string
  locale: string
  withDebugParams: boolean
  proxy: { enabled: boolean; url: string }
}

declare global {
  interface Window {
    auth: AuthApi
    appConfig: ConfigApi
  }
}

export {}
