import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

const COUNTDOWN_SECONDS = 60

export function parseEmailFromErrDlt(errDlt?: string): string {
  if (!errDlt) return ''
  const m = errDlt.match(/email=([^,\s]+)/i)
  return m?.[1] ?? ''
}

function CodeInput({ onChange }: { onChange: (code: string) => void }) {
  const [codes, setCodes] = useState<string[]>(Array(6).fill(''))
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const updateCodes = (newCodes: string[]) => {
    setCodes(newCodes)
    onChange(newCodes.join(''))
  }

  const handleInputChange = (val: string, index: number) => {
    const cleanVal = val.replace(/\D/g, '')
    const newCodes = [...codes]
    newCodes[index] = cleanVal.slice(-1)
    updateCodes(newCodes)
    if (cleanVal && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      if (!codes[index] && index > 0) {
        const newCodes = [...codes]
        newCodes[index - 1] = ''
        updateCodes(newCodes)
        inputRefs.current[index - 1]?.focus()
        e.preventDefault()
      } else if (codes[index]) {
        const newCodes = [...codes]
        newCodes[index] = ''
        updateCodes(newCodes)
        e.preventDefault()
      }
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pastedData) return
    const newCodes = [...codes]
    for (let i = 0; i < 6; i++) {
      newCodes[i] = pastedData[i] || ''
    }
    updateCodes(newCodes)
    inputRefs.current[Math.min(pastedData.length, 5)]?.focus()
  }

  return (
    <div className="flex justify-between gap-1 px-1">
      {codes.map((char, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={char}
          onChange={(e) => handleInputChange(e.target.value, index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          onPaste={handlePaste}
          className="h-10 w-10 rounded-xl border border-slate-200 bg-slate-50 text-center text-base font-semibold text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      ))}
    </div>
  )
}

function EmailVerifySection({
  email,
  onCodeChange
}: {
  email: string
  onCodeChange: (code: string) => void
}) {
  const [countdown, setCountdown] = useState(0)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const startCountdown = () => {
    setCountdown(COUNTDOWN_SECONDS)
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleSend = async () => {
    if (sending || countdown > 0) return
    setSendError('')
    try {
      setSending(true)
      const result = await window.auth?.sendEmailCode({ email, codeType: 25 })
      if (!result?.success) {
        setSendError(result?.errMsg || '发送验证码失败')
        return
      }
      startCountdown()
    } catch (e) {
      setSendError(e instanceof Error ? e.message : '发送验证码失败')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 py-2">
      <p className="text-center text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        为保障账户安全，请完成邮箱验证
        <span className="mt-1 block text-[14px] font-medium text-slate-800 select-all dark:text-slate-200">
          {email}
        </span>
      </p>
      <CodeInput onChange={onCodeChange} />
      <div className="space-y-1 text-center">
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || countdown > 0}
          className="cursor-pointer text-[13px] font-medium text-blue-600 transition-colors hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline dark:text-blue-400"
        >
          {countdown > 0 ? `${countdown}s 后重新发送` : sending ? '发送中...' : '发送验证码'}
        </button>
        {sendError && <p className="text-xs text-red-500">{sendError}</p>}
      </div>
    </div>
  )
}

function GoogleVerifySection({ onCodeChange }: { onCodeChange: (code: string) => void }) {
  return (
    <div className="flex flex-col gap-5 py-2">
      <div className="text-center text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        <p>为保障账户安全，请输入谷歌验证器中的 6 位动态码</p>
      </div>
      <CodeInput onChange={onCodeChange} />
    </div>
  )
}

export interface SecurityVerifyDialogProps {
  open: boolean
  email: string
  verifiys: string[]
  submitting?: boolean
  error?: string
  onClose: () => void
  onSubmit: (options: { emailCode?: string; googleCode?: string }) => Promise<void>
}

export default function SecurityVerifyDialog({
  open,
  email,
  verifiys,
  submitting = false,
  error = '',
  onClose,
  onSubmit
}: SecurityVerifyDialogProps) {
  const needEmail = verifiys.includes('1')
  const needGoogle = verifiys.includes('2')
  const multiStep = needEmail && needGoogle

  const [step, setStep] = useState(0)
  const [emailCode, setEmailCode] = useState('')
  const [googleCode, setGoogleCode] = useState('')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!open) return
    setStep(0)
    setEmailCode('')
    setGoogleCode('')
    setLocalError('')
  }, [open, email, verifiys.join(',')])

  if (!open) return null

  const displayError = error || localError
  const title = multiStep
    ? step === 0
      ? '安全验证'
      : '谷歌验证'
    : needEmail
      ? '安全验证'
      : '谷歌验证'

  const handleConfirm = async () => {
    setLocalError('')
    if (multiStep && step === 0) {
      if (!emailCode || emailCode.length < 6) {
        setLocalError('请输入 6 位邮箱验证码')
        return
      }
      setStep(1)
      return
    }

    if (needEmail && !multiStep && (!emailCode || emailCode.length < 6)) {
      setLocalError('请输入 6 位邮箱验证码')
      return
    }
    if (needGoogle && (!googleCode || googleCode.length < 6)) {
      setLocalError('请输入 6 位谷歌验证码')
      return
    }

    try {
      const options: { emailCode?: string; googleCode?: string } = {}
      if (needEmail) options.emailCode = emailCode
      if (needGoogle) options.googleCode = googleCode
      await onSubmit(options)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : '验证失败')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {multiStep ? (
            step === 0 ? (
              <EmailVerifySection email={email} onCodeChange={setEmailCode} />
            ) : (
              <GoogleVerifySection onCodeChange={setGoogleCode} />
            )
          ) : needEmail ? (
            <EmailVerifySection email={email} onCodeChange={setEmailCode} />
          ) : (
            <GoogleVerifySection onCodeChange={setGoogleCode} />
          )}

          {displayError && (
            <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3 text-center text-xs font-medium text-red-600 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
              {displayError}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/50">
          {multiStep && step === 1 ? (
            <button
              type="button"
              className="px-6 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"
              onClick={() => setStep(0)}
              disabled={submitting}
            >
              上一步
            </button>
          ) : (
            <button
              type="button"
              className="px-6 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </button>
          )}
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-8 py-2 font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 disabled:opacity-70"
            onClick={() => void handleConfirm()}
            disabled={submitting}
          >
            {submitting && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            {multiStep && step === 0 ? '下一步' : submitting ? '验证中...' : '确认'}
          </button>
        </div>
      </div>
    </div>
  )
}
