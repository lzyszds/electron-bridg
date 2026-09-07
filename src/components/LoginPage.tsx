import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { SettingsDialog, type AppConfig } from './SettingsDialog'
import SecurityVerifyDialog, { parseEmailFromErrDlt } from './SecurityVerifyDialog'

interface LoginPageProps {
  onLoginSuccess: (data: { token: string; userID: string }) => void
}

interface VerifyState {
  email: string
  verifiys: string[]
}

const STORAGE_KEY_ACCOUNT = 'qqlink_last_account'
const STORAGE_KEY_PASSWORD = 'qqlink_last_password'
const STORAGE_KEY_REMEMBER = 'qqlink_remember_me'

function LoginPage({ onLoginSuccess }: LoginPageProps) {
  // 从本地存储读取历史账号与密码
  const [account, setAccount] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_ACCOUNT) || 'lzyszds@qq.com'
  })
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_REMEMBER) !== 'false'
  })
  const [password, setPassword] = useState(() => {
    const remember = localStorage.getItem(STORAGE_KEY_REMEMBER) !== 'false'
    return remember ? (localStorage.getItem(STORAGE_KEY_PASSWORD) || 'Aa395878870') : ''
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [walletUrl, setWalletUrl] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [verifyState, setVerifyState] = useState<VerifyState | null>(null)
  const [verifySubmitting, setVerifySubmitting] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  useEffect(() => {
    window.appConfig?.getConfig().then((c: AppConfig) => {
      if (c) {
        setApiBaseUrl(c.apiBaseUrl)
        setWalletUrl(c.walletUrl)
      }
    })
  }, [])

  const handleConfigSaved = (cfg: AppConfig) => {
    setApiBaseUrl(cfg.apiBaseUrl)
    setWalletUrl(cfg.walletUrl)
  }

  const callLogin = async (extra?: { emailCode?: string; googleCode?: string }) => {
    const params: { email: string; password: string; emailCode?: string; googleCode?: string } = {
      email: account,
      password
    }
    if (extra?.emailCode) params.emailCode = extra.emailCode
    if (extra?.googleCode) params.googleCode = extra.googleCode
    return window.auth?.login(params)
  }

  const handleLoginSuccess = (result: { success: boolean; data?: { token: string; userID: string } }): boolean => {
    if (result.success && result.data) {
      // 本地存储账号与记住密码
      try {
        localStorage.setItem(STORAGE_KEY_ACCOUNT, account)
        localStorage.setItem(STORAGE_KEY_REMEMBER, String(rememberMe))
        if (rememberMe) {
          localStorage.setItem(STORAGE_KEY_PASSWORD, password)
        } else {
          localStorage.removeItem(STORAGE_KEY_PASSWORD)
        }
      } catch (e) {
        console.warn('[LoginPage] 本地存储写入失败:', e)
      }

      onLoginSuccess({
        token: result.data.token,
        userID: result.data.userID
      })
      return true
    }
    return false
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!account.trim()) {
      setError('请输入邮箱')
      return
    }
    if (!password.trim()) {
      setError('请输入密码')
      return
    }

    setLoading(true)

    try {
      console.log('[LoginPage] 发起登录 ->', { email: account, server: apiBaseUrl || walletUrl })
      const result = await callLogin()
      console.log('[LoginPage] 登录响应结果 ->', result)

      if (handleLoginSuccess(result)) return

      // errCode 20016 = 需要安全验证
      if (result?.errCode === 20016) {
        const verifiysStr = result.errDlt?.match(/verifiys=([0-9]+(?:,[0-9]+)*)/)?.[1]
        const email = parseEmailFromErrDlt(result.errDlt)
        if (verifiysStr && email) {
          setVerifyError('')
          setVerifyState({ email, verifiys: verifiysStr.split(',') })
          return
        }
        setError('无法解析安全验证信息，请稍后重试')
        return
      }

      const detailedErr = result?.errDlt
        ? (result.errMsg && result.errMsg !== result.errDlt ? `${result.errDlt} (${result.errMsg})` : result.errDlt)
        : (result?.errMsg || (result?.errCode !== undefined ? `登录失败 (错误码: ${result.errCode})` : '登录失败，未获取到错误信息'))
      setError(detailedErr)
      console.error('[LoginPage] 登录失败完整信息:', { errCode: result?.errCode, errMsg: result?.errMsg, errDlt: result?.errDlt, raw: result })
    } catch (err) {
      console.error('[LoginPage] 登录捕获异常:', err)
      setError(err instanceof Error ? err.message : '登录请求异常')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifySubmit = async (options: { emailCode?: string; googleCode?: string }) => {
    setVerifySubmitting(true)
    setVerifyError('')
    try {
      console.log('[LoginPage] 提交安全验证...', options)
      const result = await callLogin(options)
      console.log('[LoginPage] 验证响应结果 ->', result)
      if (handleLoginSuccess(result)) {
        setVerifyState(null)
        return
      }
      const msg = result?.errMsg || (result?.errCode !== undefined ? `验证失败 (错误码: ${result.errCode})` : '验证失败')
      setVerifyError(msg)
      console.error('[LoginPage] 验证失败提示:', msg)
      throw new Error(msg)
    } catch (err) {
      console.error('[LoginPage] 验证捕获异常:', err)
      throw err
    } finally {
      setVerifySubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* 顶部快捷操作栏 */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.bridge?.toggleDevTools?.()}
            title="打开/关闭开发者工具 (快捷键: F12 / Cmd+Opt+I / Ctrl+Shift+I)"
            className="px-2 py-1 rounded-md text-xs font-mono font-bold text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
          >
            F12
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="应用设置 (服务地址 / 代理)"
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* 头部 Logo */}
        <div className="p-8 pb-4 text-center">
          <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
            <span className="text-2xl font-black text-white">Q</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            QQLink 桥接调试工具
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            请登录您的 QQLink 账号
          </p>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-4 p-8 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              电子邮箱
            </label>
            <input
              type="email"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 font-mono"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="请输入邮箱地址"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              账户密码
            </label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-500 dark:text-slate-400 select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>记住账号与密码 (本地存储)</span>
            </label>
          </div>

          {error && (
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-center text-xs font-medium text-red-600 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 font-bold text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
            disabled={loading}
          >
            {loading && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            {loading ? '正在登录...' : '立 即 登 录'}
          </button>
        </form>

        {/* 底部服务器状态与设置 */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-8 py-3.5 dark:border-slate-800 dark:bg-slate-800/50">
          <span className="max-w-[260px] truncate font-mono text-[10px] tracking-wide text-slate-400" title={apiBaseUrl || walletUrl}>
            Server: {apiBaseUrl || walletUrl || '未配置'}
          </span>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="text-[11px] font-medium text-blue-500 hover:text-blue-600 hover:underline cursor-pointer"
          >
            设置 / 代理
          </button>
        </div>
      </div>

      {/* 设置弹窗 */}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={handleConfigSaved}
      />

      {/* 安全验证二次弹窗 */}
      {verifyState && (
        <SecurityVerifyDialog
          open
          email={verifyState.email}
          verifiys={verifyState.verifiys}
          submitting={verifySubmitting}
          error={verifyError}
          onClose={() => {
            setVerifyState(null)
            setVerifyError('')
          }}
          onSubmit={handleVerifySubmit}
        />
      )}
    </div>
  )
}

export default LoginPage
