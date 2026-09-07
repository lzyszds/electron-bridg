import { useEffect } from 'react'
import { useBridgeStore } from '../store/useBridgeStore'
import { DEVICE_PROFILES } from '../bridge/device-profiles'
import type { AuthConfig } from '../bridge/types'
import { cn } from '../lib/utils'
import { X } from 'lucide-react'

interface FieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'password'
  mono?: boolean
}

function Field({ label, value, onChange, placeholder, type = 'text', mono }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'flex h-8 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700 placeholder:text-zinc-400 focus-visible:border-primary focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
          mono && 'font-mono'
        )}
      />
    </div>
  )
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const config = useBridgeStore()
  const { auth } = config

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const authFields: { key: keyof AuthConfig; label: string; type?: 'text' | 'password' }[] = [
    { key: 'secretKey', label: 'Secret Key', type: 'password' },
    { key: 'token', label: 'Token', type: 'password' },
    { key: 'chatToken', label: 'Chat Token', type: 'password' },
    { key: 'imToken', label: 'IM Token', type: 'password' },
    { key: 'userID', label: 'User ID' },
    { key: 'groupID', label: 'Group ID' },
    { key: 'pubKey', label: 'PubKey (RSA)' }
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-[420px] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头 */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-bold text-zinc-800 dark:text-white">桥接配置</h2>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 弹窗体 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* 页面配置 */}
          <div className="mb-5 space-y-3">
            <h3 className="text-xs font-bold text-zinc-400">页面配置</h3>
            <Field
              label="默认 URL"
              value={config.defaultUrl}
              onChange={(v) => config.setConfig('defaultUrl', v)}
              placeholder="https://h5.example.com"
            />

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                设备型号
              </label>
              <select
                value={config.deviceId}
                onChange={(e) => config.setConfig('deviceId', e.target.value)}
                className="flex h-8 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-xs text-zinc-700 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                {DEVICE_PROFILES.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.width}×{d.height}
                  </option>
                ))}
              </select>
            </div>

            <Field
              label="自定义 UA（覆盖设备 UA）"
              value={config.customUserAgent}
              onChange={(v) => config.setConfig('customUserAgent', v)}
              placeholder="留空使用设备默认 UA"
              mono
            />
          </div>

          {/* 认证数据 */}
          <div className="mb-5 space-y-3">
            <h3 className="text-xs font-bold text-zinc-400">
              Mock 认证数据
            </h3>
            <p className="text-[10px] text-zinc-400">
              用于 getAuth / getInitData / refreshToken 等 handler 的返回值
            </p>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                平台
              </label>
              <div className="flex gap-1">
                {(['auto', 'ios', 'android'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => config.setAuth('platform', p)}
                    className={cn(
                      'flex-1 rounded border px-2 py-1 text-xs transition-colors',
                      auth.platform === p
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    )}
                  >
                    {p === 'auto' ? '自动' : p === 'ios' ? 'iOS' : 'Android'}
                  </button>
                ))}
              </div>
            </div>

            {authFields.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                type={f.type}
                value={auth[f.key]}
                onChange={(v) => config.setAuth(f.key, v)}
                placeholder={`mock ${f.label}`}
                mono
              />
            ))}
          </div>
        </div>

        {/* 弹窗底部 */}
        <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
          <button
            onClick={config.reset}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            恢复默认
          </button>
          <button
            onClick={onClose}
            className="h-8 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
