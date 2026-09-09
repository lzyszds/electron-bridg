import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Send,
  RotateCcw,
  Copy,
  Check,
  Plus,
  Trash2,
  Sparkles,
  Key,
  Shield,
  Layers,
  ChevronDown,
  Terminal,
  Code2,
  CheckCircle2,
  AlertCircle,
  Clock,
  HardDrive,
  FolderOpen,
  Eye,
  EyeOff
} from 'lucide-react'
import { useBridgeStore } from '../store/useBridgeStore'
import { cn } from '../lib/utils'
import type { HttpResponseResult } from '../../electron/shared/bridge'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
type BaseUrlType = 'wallet' | 'chat' | 'custom'

interface KeyValueItem {
  id: string
  key: string
  value: string
  enabled: boolean
}

interface ApiPreset {
  id: string
  name: string
  category: 'wallet' | 'chat' | 'module'
  categoryName: string
  method: HttpMethod
  baseUrlType: BaseUrlType
  path: string
  description: string
  defaultParams?: Record<string, string>
  defaultBody?: Record<string, unknown>
}

interface RequestHistoryItem {
  id: string
  timestamp: number
  method: HttpMethod
  baseUrlType: BaseUrlType
  url: string
  status?: number
  timeMs?: number
  params: KeyValueItem[]
  headers: KeyValueItem[]
  body: string
}

const API_PRESETS: ApiPreset[] = [
  // ===== 钱包核心与资产 =====
  {
    id: 'wallet-user-info',
    name: '用户信息与状态',
    category: 'wallet',
    categoryName: '钱包与资产',
    method: 'POST',
    baseUrlType: 'wallet',
    path: '/v1/user/info',
    description: '获取当前用户实名认证、等级与安全状态',
    defaultBody: {}
  },
  {
    id: 'wallet-security-policy',
    name: '安全与密码找回策略',
    category: 'wallet',
    categoryName: '钱包与资产',
    method: 'POST',
    baseUrlType: 'wallet',
    path: '/v1/user/security/policy',
    description: '获取资金密码找回策略、绑定邮箱及实名情况',
    defaultBody: {}
  },
  {
    id: 'wallet-get-config',
    name: '系统全量公共配置',
    category: 'wallet',
    categoryName: '钱包与资产',
    method: 'GET',
    baseUrlType: 'wallet',
    path: '/v1/common/getConfig',
    description: '获取客户端公共 RSA 公钥、S3 资源与域名配置'
  },
  {
    id: 'wallet-card-apply',
    name: '获取申请卡列表 (SoSoPay)',
    category: 'wallet',
    categoryName: '钱包与资产',
    method: 'GET',
    baseUrlType: 'wallet',
    path: '/v1/card/getcardapply',
    description: '获取当前可申请的虚拟卡与实体卡列表 (需自动验签)'
  },
  {
    id: 'wallet-assets',
    name: '代币资产与余额明细',
    category: 'wallet',
    categoryName: '钱包与资产',
    method: 'POST',
    baseUrlType: 'wallet',
    path: '/v1/wallet/assets',
    description: '获取链上多币种余额、估值及资产策略',
    defaultBody: {}
  },
  {
    id: 'wallet-send-email-code',
    name: '发送邮箱验证码',
    category: 'wallet',
    categoryName: '钱包与资产',
    method: 'POST',
    baseUrlType: 'wallet',
    path: '/v1/user/sendEmailCode',
    description: '请求向指定邮箱发送验证码（找回密码/解绑）',
    defaultBody: {
      email: 'test@qqlink.info',
      codeType: 1
    }
  },
  {
    id: 'wallet-verify-trade-pwd',
    name: '资金交易密码验证',
    category: 'wallet',
    categoryName: '钱包与资产',
    method: 'POST',
    baseUrlType: 'wallet',
    path: '/v1/user/verifyTradePwd',
    description: '验证 6 位资金支付密码 MD5 哈希',
    defaultBody: {
      tradePassword: ''
    }
  },

  // ===== 聊天核心业务 =====
  {
    id: 'chat-get-users-info',
    name: '批量获取用户信息',
    category: 'chat',
    categoryName: '即时通讯',
    method: 'POST',
    baseUrlType: 'chat',
    path: '/user/get_users_info',
    description: '获取指定 UserID 数组的头像、昵称与签名',
    defaultBody: {
      userIDs: ['{{userID}}']
    }
  },
  {
    id: 'chat-friend-list',
    name: '好友列表查询',
    category: 'chat',
    categoryName: '即时通讯',
    method: 'POST',
    baseUrlType: 'chat',
    path: '/friend/get_friend_list',
    description: '获取当前已添加的好友关系与状态',
    defaultBody: {}
  },
  {
    id: 'chat-conversation-list',
    name: '所有会话列表',
    category: 'chat',
    categoryName: '即时通讯',
    method: 'POST',
    baseUrlType: 'chat',
    path: '/conversation/get_all_conversation_list',
    description: '获取当前账号所有单聊与群聊会话明细',
    defaultBody: {}
  },

  // ===== 业务与模块 =====
  {
    id: 'module-financial-quote',
    name: '美股自选与行情报价',
    category: 'module',
    categoryName: '业务模块',
    method: 'GET',
    baseUrlType: 'wallet',
    path: '/v1/financial/stock/quote',
    description: '获取金融板块行情指数与大盘详情',
    defaultParams: {
      symbol: 'AAPL'
    }
  },
  {
    id: 'module-guarantee-list',
    name: '担保交易订单列表',
    category: 'module',
    categoryName: '业务模块',
    method: 'POST',
    baseUrlType: 'wallet',
    path: '/v1/guarantee/list',
    description: '查询当前担保交易订单状态',
    defaultBody: {
      page: 1,
      pageSize: 10
    }
  }
]

const METHOD_COLORS: Record<HttpMethod, { bg: string; text: string; border: string }> = {
  GET: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300' },
  POST: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-300' },
  PUT: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300' },
  DELETE: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-300' },
  PATCH: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-300' }
}

export function ApiTesterPanel() {
  const bridgeAuth = useBridgeStore((s) => s.auth)
  const [method, setMethod] = useState<HttpMethod>('POST')
  const [baseUrlType, setBaseUrlType] = useState<BaseUrlType>('wallet')
  const [path, setPath] = useState('/v1/user/info')
  const [activeReqTab, setActiveReqTab] = useState<'params' | 'body' | 'headers' | 'auth' | 'history'>('body')
  const [activeRespTab, setActiveRespTab] = useState<'body' | 'headers' | 'sent' | 'curl'>('body')

  // 参数列表
  const [params, setParams] = useState<KeyValueItem[]>([
    { id: '1', key: '', value: '', enabled: true }
  ])

  // 请求头列表
  const [headers, setHeaders] = useState<KeyValueItem[]>([
    { id: '1', key: '', value: '', enabled: true }
  ])

  // 请求体
  const [bodyText, setBodyText] = useState('{\n  \n}')
  const [bodyMode, setBodyMode] = useState<'json' | 'none'>('json')

  // 状态与响应
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<HttpResponseResult | null>(null)
  const [responseError, setResponseError] = useState<string | null>(null)
  const [showTokensModal, setShowTokensModal] = useState(() => {
    const saved = localStorage.getItem('qqlink_show_tokens_drawer')
    return saved !== null ? saved === 'true' : true
  })
  const toggleTokensDrawer = (val: boolean) => {
    setShowTokensModal(val)
    localStorage.setItem('qqlink_show_tokens_drawer', String(val))
  }
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [selectedPresetId, setSelectedPresetId] = useState<string>('')

  // 当前环境及实际 BaseURL
  const [appConfig, setAppConfig] = useState<any>(null)

  useEffect(() => {
    window.appConfig?.getConfig().then(setAppConfig).catch(() => {})
  }, [])

  // 加载本地历史记录
  useEffect(() => {
    try {
      const saved = localStorage.getItem('qqlink_api_tester_history')
      if (saved) {
        setHistory(JSON.parse(saved))
      }
    } catch {
      // 忽略
    }
  }, [])

  const saveHistory = (item: RequestHistoryItem) => {
    setHistory((prev) => {
      const updated = [item, ...prev.filter((h) => h.url !== item.url || h.method !== item.method)].slice(0, 20)
      try {
        localStorage.setItem('qqlink_api_tester_history', JSON.stringify(updated))
      } catch {
        // 忽略
      }
      return updated
    })
  }

  // 复制文本提示
  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // 格式化 JSON
  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(bodyText)
      setBodyText(JSON.stringify(parsed, null, 2))
    } catch (err: any) {
      alert(`JSON 语法有误，无法格式化:\n${err.message}`)
    }
  }

  // 变量插值替换 (支持 {{userID}}, {{token}}, {{walletToken}}, {{chatToken}})
  const interpolateVariables = useCallback((str: string): string => {
    return str
      .replace(/\{\{userID\}\}/g, bridgeAuth.userID || '')
      .replace(/\{\{token\}\}/g, bridgeAuth.token || '')
      .replace(/\{\{walletToken\}\}/g, bridgeAuth.token || '')
      .replace(/\{\{chatToken\}\}/g, bridgeAuth.chatToken || '')
      .replace(/\{\{secretKey\}\}/g, bridgeAuth.secretKey || '')
  }, [bridgeAuth])

  // 选择预设
  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId)
    const preset = API_PRESETS.find((p) => p.id === presetId)
    if (!preset) return

    setMethod(preset.method)
    setBaseUrlType(preset.baseUrlType)
    setPath(preset.path)

    if (preset.defaultParams) {
      setParams(
        Object.entries(preset.defaultParams).map(([k, v], idx) => ({
          id: String(idx + 1),
          key: k,
          value: v,
          enabled: true
        }))
      )
      setActiveReqTab('params')
    } else {
      setParams([{ id: '1', key: '', value: '', enabled: true }])
    }

    if (preset.defaultBody) {
      setBodyMode('json')
      setBodyText(JSON.stringify(preset.defaultBody, null, 2))
      if (!preset.defaultParams) {
        setActiveReqTab('body')
      }
    } else {
      setBodyMode('none')
      setBodyText('{}')
    }
  }

  // 发送请求
  const handleSend = async () => {
    if (loading) return
    setLoading(true)
    setResponseError(null)

    // 1. 构建 Query Params
    const queryParams: Record<string, string> = {}
    params.forEach((p) => {
      if (p.enabled && p.key.trim()) {
        queryParams[p.key.trim()] = interpolateVariables(p.value.trim())
      }
    })

    // 2. 构建 Headers
    const reqHeaders: Record<string, string> = {}
    headers.forEach((h) => {
      if (h.enabled && h.key.trim()) {
        reqHeaders[h.key.trim()] = interpolateVariables(h.value.trim())
      }
    })

    // 3. 构建 Body
    let reqBody: unknown = undefined
    if (bodyMode === 'json' && ['POST', 'PUT', 'PATCH'].includes(method)) {
      const interpolatedBody = interpolateVariables(bodyText.trim())
      if (interpolatedBody) {
        try {
          reqBody = JSON.parse(interpolatedBody)
        } catch {
          reqBody = interpolatedBody
        }
      }
    }

    // 4. 解析目标 URL
    let targetUrl = path.trim()
    const walletBase = appConfig?.walletUrl || 'https://api.qqlink.buzz'
    const chatBase = appConfig?.apiBaseUrl || 'https://chat.qqlink.buzz/chat'

    if (baseUrlType === 'wallet') {
      const cleanPath = targetUrl.startsWith('/') ? targetUrl : `/${targetUrl}`
      targetUrl = `${walletBase.replace(/\/+$/, '')}${cleanPath}`
    } else if (baseUrlType === 'chat') {
      const cleanPath = targetUrl.startsWith('/') ? targetUrl : `/${targetUrl}`
      targetUrl = `${chatBase.replace(/\/+$/, '')}${cleanPath}`
    }

    try {
      const res = await window.bridge.httpRequest({
        url: targetUrl,
        method,
        params: Object.keys(queryParams).length ? queryParams : undefined,
        header: reqHeaders,
        body: reqBody
      })

      setResponse(res)

      // 保存历史
      saveHistory({
        id: String(Date.now()),
        timestamp: Date.now(),
        method,
        baseUrlType,
        url: targetUrl,
        status: res.status,
        timeMs: res.timeMs,
        params,
        headers,
        body: bodyText
      })
    } catch (err: any) {
      setResponseError(err?.message || '请求执行异常')
    } finally {
      setLoading(false)
    }
  }

  // 生成 cURL 代码
  const curlCommand = useMemo(() => {
    let targetUrl = path.trim()
    const walletBase = appConfig?.walletUrl || 'https://api.qqlink.buzz'
    const chatBase = appConfig?.apiBaseUrl || 'https://chat.qqlink.buzz/chat'

    if (baseUrlType === 'wallet') {
      targetUrl = `${walletBase.replace(/\/+$/, '')}${targetUrl.startsWith('/') ? targetUrl : `/${targetUrl}`}`
    } else if (baseUrlType === 'chat') {
      targetUrl = `${chatBase.replace(/\/+$/, '')}${targetUrl.startsWith('/') ? targetUrl : `/${targetUrl}`}`
    }

    const query = params
      .filter((p) => p.enabled && p.key.trim())
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(interpolateVariables(p.value))}`)
      .join('&')

    const fullUrl = query ? `${targetUrl}?${query}` : targetUrl

    const lines = [`curl -X ${method} "${fullUrl}"`]

    if (bridgeAuth.token) {
      lines.push(`  -H "Authorization: Bearer ${bridgeAuth.token}"`)
    }
    if (bridgeAuth.chatToken) {
      lines.push(`  -H "token: ${bridgeAuth.chatToken}"`)
    }
    if (bridgeAuth.userID) {
      lines.push(`  -H "userId: ${bridgeAuth.userID}"`)
    }

    headers.forEach((h) => {
      if (h.enabled && h.key.trim()) {
        lines.push(`  -H "${h.key}: ${interpolateVariables(h.value)}"`)
      }
    })

    if (bodyMode === 'json' && ['POST', 'PUT', 'PATCH'].includes(method)) {
      lines.push(`  -H "Content-Type: application/json"`)
      const jsonStr = interpolateVariables(bodyText.trim())
      if (jsonStr) {
        lines.push(`  -d '${jsonStr.replace(/'/g, "\\'")}'`)
      }
    }

    return lines.join(' \\\n')
  }, [method, baseUrlType, path, params, headers, bodyMode, bodyText, bridgeAuth, appConfig, interpolateVariables])

  return (
    <div className="flex h-full w-full flex-col bg-white overflow-hidden select-none font-sans">
      {/* ========================================================
          1. 顶部控制栏 (环境、Token 状态指示与常用接口预设)
      ======================================================== */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50/80 gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-slate-800 tracking-tight">
              API 接口测试台
            </span>
          </div>

          <span
            className={cn(
              'text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold border shrink-0',
              appConfig?.envMode === 'test'
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-blue-50 text-blue-700 border-blue-200'
            )}
          >
            {appConfig?.envMode === 'test' ? 'TEST 环境' : 'MAIN 正式'}
          </span>

          {/* 活跃 Token 凭据徽标 */}
          <button
            type="button"
            onClick={() => toggleTokensDrawer(!showTokensModal)}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-mono cursor-pointer transition-all shrink-0"
            title="查看与复制当前活跃 Token 详情"
          >
            <Key className="w-3 h-3 text-amber-500" />
            <span className="font-semibold text-slate-800">
              {bridgeAuth.userID ? `UID: ${bridgeAuth.userID}` : '未登录'}
            </span>
            <span className="text-[10px] text-slate-400">
              {bridgeAuth.token ? '(凭据已挂载)' : '(无 Token)'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>
        </div>

        {/* 预设集合下拉选择器 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <FolderOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <select
            value={selectedPresetId}
            onChange={(e) => handleSelectPreset(e.target.value)}
            className="text-xs font-medium bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none focus:border-blue-500 cursor-pointer shadow-2xs max-w-[200px] truncate"
          >
            <option value="">-- 常用接口预设 (Collections) --</option>
            <optgroup label="💼 钱包核心与资产">
              {API_PRESETS.filter((p) => p.category === 'wallet').map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.method}] {p.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="💬 即时通讯与业务">
              {API_PRESETS.filter((p) => p.category === 'chat').map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.method}] {p.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="📱 业务模块">
              {API_PRESETS.filter((p) => p.category === 'module').map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.method}] {p.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      {/* 展开的 Token 抽屉卡片 */}
      {showTokensModal && (
        <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs animate-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              当前注入系统的鉴权凭据 (自动挂载至发出的请求头)
            </span>
            <button
              type="button"
              onClick={() => toggleTokensDrawer(false)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              收起
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 font-mono text-[11px]">
            {/* User ID */}
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col gap-1 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">User ID</span>
                {bridgeAuth.userID && (
                  <button
                    type="button"
                    onClick={() => handleCopyText(bridgeAuth.userID, 'uid')}
                    className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 flex items-center gap-1 text-[10px] cursor-pointer"
                    title="复制 UID"
                  >
                    {copiedKey === 'uid' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600 font-semibold">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>复制</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="p-1.5 bg-slate-50 rounded border border-slate-100 font-bold text-slate-800 select-all break-all">
                {bridgeAuth.userID || '未登录'}
              </div>
            </div>

            {/* 主 Token (JWT) */}
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col gap-1 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">主 Token (JWT / Authorization - 全明文)</span>
                {bridgeAuth.token && (
                  <button
                    type="button"
                    onClick={() => handleCopyText(bridgeAuth.token, 'token')}
                    className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 flex items-center gap-1 text-[10px] cursor-pointer"
                    title="复制主 Token"
                  >
                    {copiedKey === 'token' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600 font-semibold">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>复制</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="p-1.5 bg-slate-50 rounded border border-slate-100 text-slate-800 select-all break-all max-h-[85px] overflow-y-auto leading-relaxed">
                {bridgeAuth.token || '未载入'}
              </div>
            </div>

            {/* Chat Token */}
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col gap-1 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Chat Token (IM 业务 - 全明文)</span>
                {bridgeAuth.chatToken && (
                  <button
                    type="button"
                    onClick={() => handleCopyText(bridgeAuth.chatToken, 'chatToken')}
                    className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 flex items-center gap-1 text-[10px] cursor-pointer"
                    title="复制 Chat Token"
                  >
                    {copiedKey === 'chatToken' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600 font-semibold">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>复制</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="p-1.5 bg-slate-50 rounded border border-slate-100 text-slate-800 select-all break-all max-h-[85px] overflow-y-auto leading-relaxed">
                {bridgeAuth.chatToken || '未载入'}
              </div>
            </div>

            {/* HMAC SecretKey */}
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col gap-1 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">HMAC SecretKey (全明文)</span>
                {bridgeAuth.secretKey && (
                  <button
                    type="button"
                    onClick={() => handleCopyText(bridgeAuth.secretKey, 'secretKey')}
                    className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 flex items-center gap-1 text-[10px] cursor-pointer"
                    title="复制 SecretKey"
                  >
                    {copiedKey === 'secretKey' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600 font-semibold">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>复制</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="p-1.5 bg-slate-50 rounded border border-slate-100 text-slate-800 select-all break-all max-h-[85px] overflow-y-auto leading-relaxed">
                {bridgeAuth.secretKey || '未载入'}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>向钱包接口发送 POST 请求时，主进程将全自动计算 RSA+AES 加密及 HMAC-SHA256 签名，无需手工拼接。</span>
          </div>
        </div>
      )}

      {/* ========================================================
          2. Postman 统一请求栏 (Method + BaseUrl + Path + Send)
      ======================================================== */}
      <div className="p-3 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-1.5">
          {/* Method 下拉选择 */}
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as HttpMethod)}
            className={cn(
              'h-9 px-2.5 rounded-l-lg font-mono font-bold text-xs border outline-none cursor-pointer shadow-2xs transition-colors',
              METHOD_COLORS[method].bg,
              METHOD_COLORS[method].text,
              METHOD_COLORS[method].border
            )}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
            <option value="PATCH">PATCH</option>
          </select>

          {/* 目标 BaseURL 预设选择 */}
          <select
            value={baseUrlType}
            onChange={(e) => setBaseUrlType(e.target.value as BaseUrlType)}
            className="h-9 px-2.5 bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 outline-none hover:bg-slate-100 cursor-pointer shadow-2xs shrink-0"
            title="目标接口类型"
          >
            <option value="wallet">⚡ 钱包服务 (api)</option>
            <option value="chat">💬 聊天服务 (chat)</option>
            <option value="custom">🌐 完整地址 (custom)</option>
          </select>

          {/* URL 路径输入框 */}
          <div className="flex-1 relative min-w-0">
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  handleSend()
                }
              }}
              placeholder={baseUrlType === 'custom' ? 'https://example.com/api/...' : '/v1/user/info'}
              className="w-full h-9 px-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-r-lg text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
            />
          </div>

          {/* 发送按钮 */}
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !path.trim()}
            className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0"
            title="发送请求 (Cmd+Enter / Ctrl+Enter)"
          >
            {loading ? (
              <RotateCcw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 fill-white" />
            )}
            <span>{loading ? '请求中...' : '发送'}</span>
          </button>
        </div>
      </div>

      {/* ========================================================
          3. 中间上下分栏：请求配置区 (上) + 响应展示区 (下)
      ======================================================== */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* 上半部分：请求配置 Tab */}
        <div className="h-[45%] flex flex-col border-b border-slate-200 min-h-[160px]">
          {/* Tab 选项卡 */}
          <div className="flex items-center justify-between px-3 border-b border-slate-200 bg-slate-50/50 shrink-0">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'body', label: '请求体 (Body)' },
                  { id: 'params', label: `参数 (Params ${params.filter((p) => p.key).length ? `· ${params.filter((p) => p.key).length}` : ''})` },
                  { id: 'headers', label: `请求头 (Headers ${headers.filter((h) => h.key).length ? `· ${headers.filter((h) => h.key).length}` : ''})` },
                  { id: 'auth', label: '鉴权 (Auth)' },
                  { id: 'history', label: `历史 (${history.length})` }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveReqTab(tab.id)}
                  className={cn(
                    'px-3 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer',
                    activeReqTab === tab.id
                      ? 'border-blue-600 text-blue-600 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 格式化与变量快捷按钮 */}
            {activeReqTab === 'body' && (
              <div className="flex items-center gap-1.5 py-1">
                <button
                  type="button"
                  onClick={handleFormatJson}
                  className="px-2 py-0.5 text-[11px] rounded font-medium text-slate-600 hover:text-blue-600 hover:bg-white border border-slate-200 transition-all cursor-pointer flex items-center gap-1"
                  title="自动缩进并格式化 JSON"
                >
                  <Sparkles className="w-3 h-3 text-blue-500" />
                  <span>格式化 JSON</span>
                </button>
              </div>
            )}
          </div>

          {/* Tab 内容区 */}
          <div className="flex-1 overflow-y-auto p-3 bg-white">
            {/* Body 编辑器 */}
            {activeReqTab === 'body' && (
              <div className="h-full flex flex-col">
                <div className="flex items-center gap-3 mb-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="bodyMode"
                        checked={bodyMode === 'json'}
                        onChange={() => setBodyMode('json')}
                        className="text-blue-600 cursor-pointer"
                      />
                      <span>JSON (application/json)</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="bodyMode"
                        checked={bodyMode === 'none'}
                        onChange={() => setBodyMode('none')}
                        className="text-blue-600 cursor-pointer"
                      />
                      <span>none (无请求体)</span>
                    </label>
                  </div>

                  <span className="text-slate-300">|</span>

                  {/* 变量快速插入标签 */}
                  <div className="flex items-center gap-1 overflow-x-auto text-[10px] text-slate-500">
                    <span>快捷变量:</span>
                    <button
                      type="button"
                      onClick={() => setBodyText((b) => b + '\n"userID": "{{userID}}"')}
                      className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-mono text-slate-700 cursor-pointer"
                    >
                      &#123;&#123;userID&#125;&#125;
                    </button>
                    <button
                      type="button"
                      onClick={() => setBodyText((b) => b + '\n"token": "{{token}}"')}
                      className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-mono text-slate-700 cursor-pointer"
                    >
                      &#123;&#123;token&#125;&#125;
                    </button>
                  </div>
                </div>

                {bodyMode === 'json' ? (
                  <textarea
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    placeholder="{\n  \n}"
                    spellCheck={false}
                    className="flex-1 w-full p-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:bg-white resize-none text-slate-800 leading-5"
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-slate-400 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                    当前请求不携带请求体
                  </div>
                )}
              </div>
            )}

            {/* Query Params 编辑器 */}
            {activeReqTab === 'params' && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-slate-500 pb-1 border-b border-slate-100 px-1">
                  <div className="col-span-1 text-center">启用</div>
                  <div className="col-span-4">参数名 (Key)</div>
                  <div className="col-span-6">参数值 (Value)</div>
                  <div className="col-span-1 text-center">操作</div>
                </div>
                {params.map((param, index) => (
                  <div key={param.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-1 flex justify-center">
                      <input
                        type="checkbox"
                        checked={param.enabled}
                        onChange={(e) => {
                          const copy = [...params]
                          copy[index].enabled = e.target.checked
                          setParams(copy)
                        }}
                        className="rounded text-blue-600 cursor-pointer"
                      />
                    </div>
                    <div className="col-span-4">
                      <input
                        type="text"
                        value={param.key}
                        onChange={(e) => {
                          const copy = [...params]
                          copy[index].key = e.target.value
                          setParams(copy)
                        }}
                        placeholder="键名..."
                        className="w-full h-7 px-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="col-span-6">
                      <input
                        type="text"
                        value={param.value}
                        onChange={(e) => {
                          const copy = [...params]
                          copy[index].value = e.target.value
                          setParams(copy)
                        }}
                        placeholder="值 (支持 {{userID}} 等变量)..."
                        className="w-full h-7 px-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (params.length === 1) {
                            setParams([{ id: '1', key: '', value: '', enabled: true }])
                          } else {
                            setParams(params.filter((_, i) => i !== index))
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setParams([...params, { id: String(Date.now()), key: '', value: '', enabled: true }])
                  }
                  className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加参数</span>
                </button>
              </div>
            )}

            {/* Headers 编辑器 */}
            {activeReqTab === 'headers' && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-slate-500 pb-1 border-b border-slate-100 px-1">
                  <div className="col-span-1 text-center">启用</div>
                  <div className="col-span-4">请求头 (Key)</div>
                  <div className="col-span-6">请求头值 (Value)</div>
                  <div className="col-span-1 text-center">操作</div>
                </div>
                {headers.map((header, index) => (
                  <div key={header.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-1 flex justify-center">
                      <input
                        type="checkbox"
                        checked={header.enabled}
                        onChange={(e) => {
                          const copy = [...headers]
                          copy[index].enabled = e.target.checked
                          setHeaders(copy)
                        }}
                        className="rounded text-blue-600 cursor-pointer"
                      />
                    </div>
                    <div className="col-span-4">
                      <input
                        type="text"
                        value={header.key}
                        onChange={(e) => {
                          const copy = [...headers]
                          copy[index].key = e.target.value
                          setHeaders(copy)
                        }}
                        placeholder="Header 名..."
                        className="w-full h-7 px-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="col-span-6">
                      <input
                        type="text"
                        value={header.value}
                        onChange={(e) => {
                          const copy = [...headers]
                          copy[index].value = e.target.value
                          setHeaders(copy)
                        }}
                        placeholder="值..."
                        className="w-full h-7 px-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (headers.length === 1) {
                            setHeaders([{ id: '1', key: '', value: '', enabled: true }])
                          } else {
                            setHeaders(headers.filter((_, i) => i !== index))
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setHeaders([...headers, { id: String(Date.now()), key: '', value: '', enabled: true }])
                  }
                  className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加自定义请求头</span>
                </button>
              </div>
            )}

            {/* Auth 鉴权说明 */}
            {activeReqTab === 'auth' && (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                  <div className="flex items-center gap-2 font-semibold text-emerald-800 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>自动继承当前登录态 (Inherit Current Auth)</span>
                  </div>
                  <p className="text-emerald-700 leading-relaxed text-[11px]">
                    工作台发出的所有请求均已自动注入当前环境登录的 Token。当目标为钱包服务时，底层将使用已登录账号的 SecretKey 全自动生成 HMAC 验签并完成数据加密，无需在此单独配置鉴权。
                  </p>
                </div>
              </div>
            )}

            {/* History 请求历史 */}
            {activeReqTab === 'history' && (
              <div className="space-y-1.5">
                {history.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    暂无请求历史
                  </div>
                ) : (
                  history.map((h) => (
                    <div
                      key={h.id}
                      onClick={() => {
                        setMethod(h.method)
                        setBaseUrlType(h.baseUrlType)
                        setPath(h.url)
                        setParams(h.params)
                        setHeaders(h.headers)
                        setBodyText(h.body)
                      }}
                      className="p-2 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                        <span
                          className={cn(
                            'text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border shrink-0',
                            METHOD_COLORS[h.method].bg,
                            METHOD_COLORS[h.method].text,
                            METHOD_COLORS[h.method].border
                          )}
                        >
                          {h.method}
                        </span>
                        <span className="font-mono text-xs text-slate-800 truncate">
                          {h.url}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 font-mono text-[10px] text-slate-400">
                        {h.status && (
                          <span
                            className={cn(
                              'px-1.5 py-0.2 rounded font-semibold',
                              h.status >= 200 && h.status < 300
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            )}
                          >
                            {h.status}
                          </span>
                        )}
                        {h.timeMs !== undefined && <span>{h.timeMs}ms</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* 下半部分：响应展示区 (Response Area) */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/30">
          {/* 响应状态栏 */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 bg-white shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700">响应结果</span>

              {response && (
                <div className="flex items-center gap-2">
                  {/* HTTP 状态码 */}
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-mono font-bold border',
                      response.status >= 200 && response.status < 300
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : response.status >= 400 && response.status < 500
                        ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : 'bg-rose-50 text-rose-700 border-rose-300'
                    )}
                  >
                    {response.status} {response.statusText}
                  </span>

                  {/* 耗时 */}
                  {response.timeMs !== undefined && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-500 font-mono">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{response.timeMs} ms</span>
                    </span>
                  )}

                  {/* 体积 */}
                  {response.sizeBytes !== undefined && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-500 font-mono">
                      <HardDrive className="w-3 h-3 text-slate-400" />
                      <span>{(response.sizeBytes / 1024).toFixed(2)} KB</span>
                    </span>
                  )}
                </div>
              )}

              {responseError && (
                <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-rose-600" />
                  <span>{responseError}</span>
                </span>
              )}
            </div>

            {/* 响应视图切换与快捷复制 */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveRespTab('body')}
                className={cn(
                  'px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-colors',
                  activeRespTab === 'body'
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                响应体 (Body)
              </button>
              <button
                type="button"
                onClick={() => setActiveRespTab('headers')}
                className={cn(
                  'px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-colors',
                  activeRespTab === 'headers'
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                响应头
              </button>
              <button
                type="button"
                onClick={() => setActiveRespTab('sent')}
                className={cn(
                  'px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-colors',
                  activeRespTab === 'sent'
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                )}
                title="查看实际向网络发出的底层完整 Headers 与 Body"
              >
                实际发出报文
              </button>
              <button
                type="button"
                onClick={() => setActiveRespTab('curl')}
                className={cn(
                  'px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-colors',
                  activeRespTab === 'curl'
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                cURL
              </button>

              <div className="h-3 w-px bg-slate-200 mx-1" />

              {/* 复制响应体按钮 */}
              {response && (
                <button
                  type="button"
                  onClick={() =>
                    handleCopyText(
                      typeof response.data === 'object'
                        ? JSON.stringify(response.data, null, 2)
                        : String(response.data),
                      'respBody'
                    )
                  }
                  className="px-2 py-1 text-[11px] rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center gap-1 cursor-pointer"
                  title="复制响应体 JSON"
                >
                  {copiedKey === 'respBody' ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3 text-slate-500" />
                  )}
                  <span>复制</span>
                </button>
              )}
            </div>
          </div>

          {/* 响应内容 */}
          <div className="flex-1 overflow-auto p-3 font-mono text-xs">
            {!response && !responseError ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 select-none">
                <Send className="w-6 h-6 text-slate-300 stroke-1" />
                <span className="text-xs">点击上方“发送”按钮执行 API 测试</span>
              </div>
            ) : activeRespTab === 'body' ? (
              <pre className="text-slate-800 leading-5 whitespace-pre-wrap break-all font-mono selection:bg-blue-100">
                {typeof response?.data === 'object'
                  ? JSON.stringify(response.data, null, 2)
                  : String(response?.data || '')}
              </pre>
            ) : activeRespTab === 'headers' ? (
              <div className="space-y-1">
                {Object.entries(response?.headers || {}).map(([key, val]) => (
                  <div key={key} className="flex items-start gap-2 py-0.5 border-b border-slate-100">
                    <span className="font-semibold text-slate-600 min-w-[140px] truncate">{key}:</span>
                    <span className="text-slate-800 break-all">{val}</span>
                  </div>
                ))}
              </div>
            ) : activeRespTab === 'sent' ? (
              <div className="space-y-3">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 block mb-1">
                    实际发出的目标地址 (Target URL)
                  </span>
                  <div className="p-2 bg-white rounded border border-slate-200 text-blue-700 break-all">
                    {response?.requestInfo?.url || '无'}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-bold text-slate-500 block mb-1">
                    实际挂载的请求头 (包含自动计算的签名与设备信息)
                  </span>
                  <div className="p-2 bg-white rounded border border-slate-200 space-y-1">
                    {Object.entries(response?.requestInfo?.headers || {}).map(([k, v]) => (
                      <div key={k} className="flex items-start gap-2 py-0.5 border-b border-slate-50 last:border-0">
                        <span className="text-purple-700 font-semibold min-w-[140px]">{k}:</span>
                        <span className="text-slate-800 break-all">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {response?.requestInfo?.body && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 block mb-1">
                      实际发出的载荷 (Body)
                    </span>
                    <pre className="p-2 bg-white rounded border border-slate-200 text-slate-800 overflow-x-auto">
                      {typeof response.requestInfo.body === 'object'
                        ? JSON.stringify(response.requestInfo.body, null, 2)
                        : String(response.requestInfo.body)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-500 text-[11px] font-bold">可直接在终端执行的 cURL 命令：</span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(curlCommand, 'curl')}
                    className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-sans text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'curl' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>一键复制 cURL</span>
                  </button>
                </div>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto leading-relaxed whitespace-pre-wrap selection:bg-blue-600">
                  {curlCommand}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
