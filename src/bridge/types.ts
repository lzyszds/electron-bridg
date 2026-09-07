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

export const DEFAULT_PUB_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3wgR1Je/AEQxOWIfnFaF
J2uf06HnIp4DDdfXaKNmyBlA2XYMlwJ0dd9KO+4egV9zHld9QMvIH5JxmffNU+zA
tmTTptO4BeVKrKbyZM8JSY4jR1dW0X+tJz0IIR+KrV5ukBZuraoFyxs/ZcdXXdsd
8aFgk9e02c38ax0eijus3CgASGFmFpkXvsgL1UVMcjHR9jT0f88hphwv2G4SJBiK
tKjFlAY/753whBe326nlybHRsujfOVOLyoY6YvF/FKPc9mjrABud/rtjajQbgIMQ
XplC0SfrL6y4iPdhjgYPWo+6g+KDGMcvte1PomHwUX/nGFcs1c8RcmULD9sz+MGh
9QIDAQAB
-----END PUBLIC KEY-----`

export const defaultAuthConfig: AuthConfig = {
  secretKey: '',
  token: '',
  chatToken: '',
  imToken: '',
  userID: '',
  groupID: '',
  pubKey: DEFAULT_PUB_KEY,
  platform: 'auto'
}

export const defaultBridgeConfig: BridgeConfig = {
  defaultUrl: '',
  deviceId: 'iphone-15-pro',
  customUserAgent: '',
  auth: { ...defaultAuthConfig }
}