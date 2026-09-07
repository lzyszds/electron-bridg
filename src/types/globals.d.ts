/** 主进程暴露的认证 API */
interface AuthApi {
  login: (params: {
    email?: string
    password: string
    emailCode?: string
    googleCode?: string
  }) => Promise<{
    success: boolean
    data?: { token: string; refreshToken: string; expireTime: number; userID: string }
    errMsg?: string
    errCode?: number
    errDlt?: string
  }>
  sendEmailCode: (params: { email: string; codeType: number }) => Promise<{ success: boolean; errMsg?: string }>
  getToken: () => Promise<string>
  isLoggedIn: () => Promise<boolean>
  getAuthInfo: () => Promise<{
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
  getAuthTokens: () => Promise<{
    token: string
    secretKey: string
    kbitToken: string
    chatToken: string
  }>
  getUserID: () => Promise<string>
  logout: () => void
}

/** 主进程暴露的配置 API */
interface ConfigApi {
  getConfig: () => Promise<AppConfig>
  setConfig: (patch: Partial<AppConfig>) => Promise<AppConfig>
  onConfigChanged: (callback: (cfg: AppConfig) => void) => () => void
}

interface AppConfig {
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
