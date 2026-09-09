/**
 * H5 模块清单定义（提取自 /Users/mac/newQQLink/qqlink_h5）
 */

export interface H5Module {
  id: string
  name: string
  category: 'financial' | 'asset' | 'business' | 'activity' | 'dev'
  categoryName: string
  path: string
  description?: string
  icon: string
  defaultParams?: Record<string, string>
}

export interface ModuleCategory {
  id: H5Module['category']
  name: string
  icon: string
}

export const MODULE_CATEGORIES: ModuleCategory[] = [
  { id: 'financial', name: '金融行情', icon: '📈' },
  { id: 'asset', name: '资产交易', icon: '💳' },
  { id: 'business', name: '核心业务', icon: '🧩' },
  { id: 'activity', name: '活动靓号', icon: '🎁' },
  { id: 'dev', name: '支持调试', icon: '🛠️' }
]

export const H5_MODULES: H5Module[] = [
  // ===== 金融行情 =====
  {
    id: 'financial-usStocks',
    name: '美股行情',
    category: 'financial',
    categoryName: '金融行情',
    path: '/financial/usStocks',
    description: '美股自选、K线图表、持仓交易行情',
    icon: '📊'
  },
  {
    id: 'financial-market',
    name: '行情市场',
    category: 'financial',
    categoryName: '金融行情',
    path: '/financial/market',
    description: '综合行情大盘总览与指数',
    icon: '📈'
  },
  {
    id: 'financial-indices',
    name: '全球股指',
    category: 'financial',
    categoryName: '金融行情',
    path: '/financial/indices',
    description: '纳斯达克、标普500等股指详情',
    icon: '📉'
  },
  {
    id: 'financial-preciousMetals',
    name: '贵金属',
    category: 'financial',
    categoryName: '金融行情',
    path: '/financial/preciousMetals',
    description: '黄金、白银实时现货贵金属',
    icon: '🪙'
  },
  {
    id: 'financial-commodities',
    name: '大宗商品',
    category: 'financial',
    categoryName: '金融行情',
    path: '/financial/commodities',
    description: '原油、天然气等期货大宗商品',
    icon: '🛢️'
  },

  // ===== 资产交易 =====
  {
    id: 'asset-trxBuy',
    name: '闪兑交易 (TRX)',
    category: 'asset',
    categoryName: '资产交易',
    path: '/trxBuy',
    description: '波场 TRX 快速闪兑买币',
    icon: '🔄'
  },
  {
    id: 'asset-token-assets',
    name: '代币资产',
    category: 'asset',
    categoryName: '资产交易',
    path: '/token-assets',
    description: '链上资产汇总与策略配置',
    icon: '💰'
  },
  {
    id: 'asset-top-up',
    name: '充值中心',
    category: 'asset',
    categoryName: '资产交易',
    path: '/top-up',
    description: '数字货币与法币充值充币',
    icon: '📥'
  },
  {
    id: 'asset-tokenTransfer',
    name: '代币转账',
    category: 'asset',
    categoryName: '资产交易',
    path: '/tokenTransfer',
    description: '链上多链代币划转与转账',
    icon: '💸'
  },
  {
    id: 'asset-cardApply',
    name: 'U卡申请',
    category: 'asset',
    categoryName: '资产交易',
    path: '/cardApply',
    description: '万事达/Visa 虚拟 U 卡申领与开通',
    icon: '💳'
  },
  {
    id: 'asset-guarantee',
    name: '担保交易',
    category: 'asset',
    categoryName: '资产交易',
    path: '/guarantee',
    description: '点对点第三方信任担保中介',
    icon: '🛡️'
  },

  // ===== 核心业务 =====
  {
    id: 'module-vip',
    name: 'VIP 会员中心',
    category: 'business',
    categoryName: '核心业务',
    path: '/module/vip',
    description: '星轨会员等级、专属福利与特权',
    icon: '👑'
  },
  {
    id: 'module-vip-modifyTag',
    name: '个性化特权展示',
    category: 'business',
    categoryName: '核心业务',
    path: '/module/vip/modifyVipTag',
    description: '彩色昵称、会员等级标识等个性化特权展示配置',
    icon: '✨'
  },
  {
    id: 'module-inviteCenter',
    name: '邀请中心',
    category: 'business',
    categoryName: '核心业务',
    path: '/module/inviteCenter',
    description: '好友邀请奖励、返佣与海报分享',
    icon: '👥'
  },
  {
    id: 'module-qr',
    name: '扫码付',
    category: 'business',
    categoryName: '核心业务',
    path: '/module/qr',
    description: '离线与在线聚合扫码支付',
    icon: '📱'
  },
  {
    id: 'module-scanCode',
    name: '扫码抽奖',
    category: 'business',
    categoryName: '核心业务',
    path: '/module/scanCode',
    description: '扫码参与活动与积分抽奖',
    icon: '🎁'
  },
  {
    id: 'module-join',
    name: '商家入驻',
    category: 'business',
    categoryName: '核心业务',
    path: '/module/join',
    description: '全球商家签约、接入与资质申请',
    icon: '🏪'
  },
  {
    id: 'module-reserveFund',
    name: '储备金证明',
    category: 'business',
    categoryName: '核心业务',
    path: '/module/reserveFund',
    description: '平台默克尔树资金 100% 储备公示',
    icon: '🏦'
  },
  {
    id: 'module-securityAudit',
    name: '安全审计报告',
    category: 'business',
    categoryName: '核心业务',
    path: '/module/securityAudit',
    description: '第三方知名安全公司智能合约审计',
    icon: '🔒'
  },
  {
    id: 'module-rewardCenter',
    name: '奖励任务中心',
    category: 'business',
    categoryName: '核心业务',
    path: '/module/rewardCenter',
    description: '新手任务、进阶活动与积分奖励',
    icon: '🎉'
  },
  {
    id: 'module-notebook',
    name: '云记事本',
    category: 'business',
    categoryName: '核心业务',
    path: '/module/notebook',
    description: '私密加密记事本与助记词备忘',
    icon: '📝'
  },
  {
    id: 'module-gasFeeproxy',
    name: 'Gas 费代付',
    category: 'business',
    categoryName: '核心业务',
    path: '/module/gasFeeproxy',
    description: '无燃料情况下免 Gas 交易代付',
    icon: '⛽'
  },
  {
    id: 'module-esim',
    name: 'eSIM 流量',
    category: 'business',
    categoryName: '核心业务',
    path: '/module/esim',
    description: '全球 150+ 国家离境境外流量包',
    icon: '📶'
  },
  {
    id: 'module-share',
    name: '推广分享页',
    category: 'business',
    categoryName: '核心业务',
    path: '/module/share',
    description: '多样式分享图卡与推广渠道',
    icon: '🔗'
  },

  // ===== 活动靓号 =====
  {
    id: 'activity-vanitasNumber',
    name: '靓号商城',
    category: 'activity',
    categoryName: '活动靓号',
    path: '/vanitasNumber',
    description: '稀缺 3~7 位顶级个性 QQLink 账号',
    icon: '🔢'
  },
  {
    id: 'activity-firstCharge',
    name: '首充赠 4 位靓号',
    category: 'activity',
    categoryName: '活动靓号',
    path: '/activity/get4NumberWithFirstCharge',
    description: '首充任意金额自选送 4 位极品号',
    icon: '🔥'
  },
  {
    id: 'activity-tutorial',
    name: '使用教程',
    category: 'activity',
    categoryName: '活动靓号',
    path: '/tutorial',
    description: '新手快速上手指南与避坑教程',
    icon: '📖'
  },
  {
    id: 'activity-news',
    name: '新闻资讯',
    category: 'activity',
    categoryName: '活动靓号',
    path: '/news',
    description: '行业新闻与官方公告动态',
    icon: '📰'
  },
  {
    id: 'activity-me',
    name: '个人中心',
    category: 'activity',
    categoryName: '活动靓号',
    path: '/me',
    description: '个人账户设置与个人主页',
    icon: '👤'
  },

  // ===== 支持调试 =====
  {
    id: 'dev-console',
    name: 'H5 Dev 调试页',
    category: 'dev',
    categoryName: '支持调试',
    path: '/dev',
    description: 'Nuxt 本地调试与桥接特性试验场',
    icon: '⚙️'
  },
  {
    id: 'support-feedback',
    name: '意见与工单反馈',
    category: 'dev',
    categoryName: '支持调试',
    path: '/module/feedback',
    description: '提交工单与产品体验反馈',
    icon: '💬'
  },
  {
    id: 'support-tradepwd-appeal',
    name: '资金密码申诉',
    category: 'dev',
    categoryName: '支持调试',
    path: '/module/iForget/tradepwd',
    description: '资金密码找回、曾用密码及实名申诉流程',
    icon: '🔐'
  },
  {
    id: 'support-iForget',
    name: '登录密码申诉',
    category: 'dev',
    categoryName: '支持调试',
    path: '/module/iForget/password',
    description: '账号登录密码安全申诉与凭证重置',
    icon: '🔑'
  },
  {
    id: 'support-banRecord',
    name: '封禁记录公示',
    category: 'dev',
    categoryName: '支持调试',
    path: '/module/banRecord',
    description: '违规账号公开公示列表',
    icon: '⚠️'
  }
]

/**
 * 常用环境预设
 */
export const BASE_URL_PRESETS = [
  { label: '正式环境 (main 分支)', value: 'https://module.qqlink.info' },
  { label: '测试环境 (test 分支 SPA)', value: 'https://module.qqlink.buzz' },
  { label: '本地 Nuxt 开发', value: 'http://localhost:3000' }
]

export type EnvMode = 'prod' | 'test'

export interface EnvPresetItem {
  mode: EnvMode
  label: string
  shortLabel: string
  tag: string
  h5BaseUrl: string
  walletUrl: string
  apiBaseUrl: string
  desc: string
}

export const ENV_MODES: Record<EnvMode, EnvPresetItem> = {
  prod: {
    mode: 'prod',
    label: '正式环境 (main)',
    shortLabel: '正式',
    tag: 'MAIN',
    h5BaseUrl: 'https://module.qqlink.info',
    walletUrl: 'https://api.qqlink.live',
    apiBaseUrl: 'https://chat.qqlink.live/chat',
    desc: '主分支正式环境，使用原生/H5混合鉴权'
  },
  test: {
    mode: 'test',
    label: '测试环境 (test)',
    shortLabel: '测试',
    tag: 'TEST',
    h5BaseUrl: 'https://module.qqlink.buzz',
    walletUrl: 'https://api.qqlink.buzz',
    apiBaseUrl: 'https://chat.qqlink.buzz/chat',
    desc: '全新 SPA 架构，全方面接口代理桥接 (Proxy / NodeConfig / Ws)'
  }
}

/**
 * 根据基础 URL、路径、语言和调试参数拼接完整访问地址
 */
export function buildModuleUrl(
  baseUrl: string,
  path: string,
  locale: string = 'zh-hans',
  withDebugParams: boolean = true
): string {
  const cleanBase = (baseUrl || 'https://module.qqlink.info').replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const prefix = locale ? `/${locale}` : ''
  const fullUrlStr = `${cleanBase}${prefix}${cleanPath}`

  try {
    const url = new URL(fullUrlStr)
    if (withDebugParams) {
      if (!url.searchParams.has('safeArea')) {
        url.searchParams.set('safeArea', '50')
      }
      if (!url.searchParams.has('vconsole')) {
        url.searchParams.set('vconsole', 'yes')
      }
    }
    return url.toString()
  } catch {
    // 降级返回
    const qs = withDebugParams ? '?safeArea=50&vconsole=yes' : ''
    return `${fullUrlStr}${qs}`
  }
}

/**
 * 从完整 URL 中提取模块纯相对路径（剥除 locale 前缀与 query 参数）
 */
export function extractModulePath(urlStr: string, locale: string = 'zh-hans'): string {
  try {
    const u = new URL(urlStr)
    let pathname = u.pathname
    const localePrefix = `/${locale}`
    if (pathname.startsWith(localePrefix)) {
      pathname = pathname.substring(localePrefix.length)
    }
    return pathname || '/'
  } catch {
    return '/'
  }
}
