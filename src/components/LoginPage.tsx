import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { SettingsDialog, type AppConfig } from './SettingsDialog'
import SecurityVerifyDialog, { parseEmailFromErrDlt } from './SecurityVerifyDialog'
import { ENV_MODES, envPresetPatch, type EnvMode } from '../config/modules'
import { cn } from '../lib/utils'

interface LoginPageProps {
  onLoginSuccess: (data: { token: string; userID: string }, envMode?: EnvMode) => void
  initialEnvMode?: EnvMode
}

interface VerifyState {
  email: string
  verifiys: string[]
}

const getAccountKey = (mode: string) => `qqlink_last_account_${mode}`
const getPasswordKey = (mode: string) => `qqlink_last_password_${mode}`
const getRememberKey = (mode: string) => `qqlink_remember_me_${mode}`

function LoginPage({ onLoginSuccess, initialEnvMode }: LoginPageProps) {
  const [envMode, setEnvMode] = useState<EnvMode>(() => {
    return initialEnvMode || (localStorage.getItem('qqlink_env_mode') as EnvMode) || 'prod'
  })

  // 根据当前 envMode 从本地存储读取历史账号与密码
  const [account, setAccount] = useState(() => {
    const curEnv = initialEnvMode || (localStorage.getItem('qqlink_env_mode') as EnvMode) || 'prod'
    const stored = localStorage.getItem(getAccountKey(curEnv)) || localStorage.getItem('qqlink_last_account')
    return stored || (curEnv === 'test' ? 'test@qqlink.buzz' : 'lzyszds@qq.com')
  })

  const [rememberMe, setRememberMe] = useState(() => {
    const curEnv = initialEnvMode || (localStorage.getItem('qqlink_env_mode') as EnvMode) || 'prod'
    return localStorage.getItem(getRememberKey(curEnv)) !== 'false'
  })

  const [password, setPassword] = useState(() => {
    const curEnv = initialEnvMode || (localStorage.getItem('qqlink_env_mode') as EnvMode) || 'prod'
    const remember = localStorage.getItem(getRememberKey(curEnv)) !== 'false'
    const stored = localStorage.getItem(getPasswordKey(curEnv)) || localStorage.getItem('qqlink_last_password')
    return remember ? (stored || 'Aa395878870') : ''
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [walletUrl, setWalletUrl] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [verifyState, setVerifyState] = useState<VerifyState | null>(null)
  const [verifySubmitting, setVerifySubmitting] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  // 切换环境时刷新账号与服务器地址
  const handleSwitchEnv = (mode: EnvMode) => {
    setEnvMode(mode)
    setError('')
    localStorage.setItem('qqlink_env_mode', mode)
    const preset = ENV_MODES[mode]
    setApiBaseUrl(preset.apiBaseUrl)
    setWalletUrl(preset.walletUrl)

    // 读取该环境专属账号密码
    const storedAccount = localStorage.getItem(getAccountKey(mode))
    const remember = localStorage.getItem(getRememberKey(mode)) !== 'false'
    const storedPassword = remember ? (localStorage.getItem(getPasswordKey(mode)) || '') : ''

    setAccount(storedAccount || (mode === 'test' ? '' : 'lzyszds@qq.com'))
    setRememberMe(remember)
    setPassword(storedPassword || (mode === 'test' ? '' : 'Aa395878870'))

    // 登录页切环境时立刻写回主进程，否则 getNodeConfig 仍会按磁盘上的旧 envMode 返回 buzz
    void window.appConfig?.setConfig(envPresetPatch(mode))
  }

  useEffect(() => {
    if (initialEnvMode) {
      handleSwitchEnv(initialEnvMode)
    } else {
      window.appConfig?.getConfig().then((c: AppConfig) => {
        if (c) {
          const mode = c.envMode || envMode
          handleSwitchEnv(mode)
        }
      })
    }
  }, [initialEnvMode])

  const handleConfigSaved = (cfg: AppConfig) => {
    if (cfg.envMode) setEnvMode(cfg.envMode)
    setApiBaseUrl(cfg.apiBaseUrl)
    setWalletUrl(cfg.walletUrl)
  }

  const callLogin = async (extra?: { emailCode?: string; googleCode?: string }) => {
    const params: { email: string; password: string; emailCode?: string; googleCode?: string; envMode: string } = {
      email: account,
      password,
      envMode
    }
    if (extra?.emailCode) params.emailCode = extra.emailCode
    if (extra?.googleCode) params.googleCode = extra.googleCode
    return window.auth?.login(params)
  }

  const handleLoginSuccess = (result: { success: boolean; data?: { token: string; userID: string } }): boolean => {
    if (result.success && result.data) {
      // 本地存储专属环境的账号与记住密码
      try {
        localStorage.setItem(getAccountKey(envMode), account)
        localStorage.setItem(getRememberKey(envMode), String(rememberMe))
        if (rememberMe) {
          localStorage.setItem(getPasswordKey(envMode), password)
        } else {
          localStorage.removeItem(getPasswordKey(envMode))
        }
        localStorage.setItem('qqlink_env_mode', envMode)
      } catch (e) {
        console.warn('[LoginPage] 本地存储写入失败:', e)
      }

      onLoginSuccess({
        token: result.data.token,
        userID: result.data.userID
      }, envMode)
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
          {/* 登录目标环境模式选择 */}
          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200/80 dark:border-slate-700">
            <button
              type="button"
              onClick={() => handleSwitchEnv('prod')}
              className={cn(
                'flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer',
                envMode === 'prod'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs border border-blue-200/80 font-bold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', envMode === 'prod' ? 'bg-blue-500' : 'bg-slate-300')} />
              <span>🚀 正式环境 (main)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchEnv('test')}
              className={cn(
                'flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer',
                envMode === 'test'
                  ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs border border-purple-200/80 font-bold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', envMode === 'test' ? 'bg-purple-500' : 'bg-slate-300')} />
              <span>🧪 测试环境 (test)</span>
            </button>
          </div>

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
