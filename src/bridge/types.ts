export interface AuthConfig {
  secretKey: string
  token: string
  chatToken: string
  imToken: string
  userID: string
  groupID: string
  pubKey: string
  platform: 'android' | 'ios' | 'auto'
}

export interface BridgeConfig {
  defaultUrl: string
  deviceId: string
  customUserAgent: string
  auth: AuthConfig
}

export type LogSource = 'console' | 'bridge' | 'system'

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'system'

export interface LogEntry {
  id: number
  source: LogSource
  level: LogLevel
  message: string
  detail?: unknown
  direction?: 'in' | 'out'
  action?: string
  timestamp: number
}

export const defaultAuthConfig: AuthConfig = {
  secretKey: '',
  token: '',
  chatToken: '',
  imToken: '',
  userID: '',
  groupID: '',
  pubKey: '',
  platform: 'auto'
}

export const defaultBridgeConfig: BridgeConfig = {
  defaultUrl: '',
  deviceId: 'iphone-15-pro',
  customUserAgent: '',
  auth: { ...defaultAuthConfig }
}