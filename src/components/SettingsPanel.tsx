import { useBridgeStore } from '../store/useBridgeStore'
import { DEVICE_PROFILES } from '../bridge/device-profiles'
import type { AuthConfig } from '../bridge/types'
import { cn } from '../lib/utils'

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
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'flex h-8 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          mono && 'font-mono'
        )}
      />
    </div>
  )
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const config = useBridgeStore()
  const { auth } = config

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
    <div className="absolute right-0 top-0 z-30 h-full w-80 overflow-y-auto border-l border-border bg-card p-4 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">桥接配置</h2>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>

      {/* 默认 URL */}
      <div className="mb-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground">页面配置</h3>
        <Field
          label="默认 URL"
          value={config.defaultUrl}
          onChange={(v) => config.setConfig('defaultUrl', v)}
          placeholder="https://h5.example.com"
        />

        {/* 设备选择 */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">设备型号</label>
          <select
            value={config.deviceId}
            onChange={(e) => config.setConfig('deviceId', e.target.value)}
            className="flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {DEVICE_PROFILES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {/* 自定义 UA */}
        <Field
          label="自定义 UA（覆盖设备 UA）"
          value={config.customUserAgent}
          onChange={(v) => config.setConfig('customUserAgent', v)}
          placeholder="留空使用设备默认 UA"
          mono
        />
      </div>

      {/* 认证数据 */}
      <div className="mb-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground">
          Mock 认证数据（getAuth / getInitData / refreshToken）
        </h3>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">平台</label>
          <div className="flex gap-1">
            {(['auto', 'ios', 'android'] as const).map((p) => (
              <button
                key={p}
                onClick={() => config.setAuth('platform', p)}
                className={cn(
                  'flex-1 rounded border px-2 py-1 text-xs transition-colors',
                  auth.platform === p
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-accent'
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

      <button
        onClick={config.reset}
        className="h-8 w-full rounded-md border border-border text-xs hover:bg-accent"
      >
        恢复默认
      </button>

      <p className="mt-4 text-[10px] leading-4 text-muted-foreground">
        配置自动持久化到本地，重启后保留。认证数据用于 mock getAuth/getInitData/refreshToken
        等 handler 的返回值。
      </p>
    </div>
  )
}
