import { HttpsProxyAgent } from 'https-proxy-agent'
import { loadConfig } from './config'

export function getProxyAgent(): HttpsProxyAgent<string> | undefined {
  const { proxy } = loadConfig()
  if (!proxy?.enabled || !proxy.url) return undefined
  return new HttpsProxyAgent(proxy.url)
}
