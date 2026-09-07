export interface DeviceProfile {
  id: string
  name: string
  userAgent: string
  width: number
  height: number
  deviceScaleFactor?: number
}

export const DEVICE_PROFILES: DeviceProfile[] = [
  {
    id: 'iphone-15-pro',
    name: 'iPhone 15 Pro',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    width: 393,
    height: 852,
    deviceScaleFactor: 3
  },
  {
    id: 'iphone-se',
    name: 'iPhone SE',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    width: 375,
    height: 667,
    deviceScaleFactor: 2
  },
  {
    id: 'pixel-8-pro',
    name: 'Pixel 8 Pro',
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625
  },
  {
    id: 'android-webview',
    name: 'Android WebView',
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
    width: 360,
    height: 780,
    deviceScaleFactor: 2.75
  }
]

export const DEFAULT_DEVICE_ID = 'iphone-15-pro'

export function getDeviceProfile(id: string): DeviceProfile {
  return DEVICE_PROFILES.find((d) => d.id === id) ?? DEVICE_PROFILES[0]
}