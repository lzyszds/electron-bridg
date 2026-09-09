import React from 'react'
import {
  LineChart,
  TrendingUp,
  Activity,
  Coins,
  Boxes,
  DollarSign,
  CircleDollarSign,
  Zap,
  ArrowDownToLine,
  ArrowRightLeft,
  CreditCard,
  MessageSquare,
  Compass,
  Crown,
  Gift,
  Bug,
  Wallet,
  Layers,
  Sparkles,
  Wrench,
  ShieldCheck,
  FileText,
  HelpCircle,
  Terminal,
  Lock,
  KeyRound,
  LucideIcon
} from 'lucide-react'

// 为每个已知模块映射精确的高精度 Lucide 图标
const MODULE_ICON_MAP: Record<string, LucideIcon> = {
  // 金融行情
  'financial-usStocks': LineChart,
  'financial-market': TrendingUp,
  'financial-indices': Activity,
  'financial-preciousMetals': Coins,
  'financial-commodities': Boxes,
  'financial-forex': DollarSign,
  'financial-crypto': CircleDollarSign,

  // 资产交易
  'asset-trxBuy': Zap,
  'asset-token': Coins,
  'asset-topUp': ArrowDownToLine,
  'asset-transfer': ArrowRightLeft,
  'asset-uCard': CreditCard,
  'asset-bankCard': CreditCard,

  // 核心业务
  'module-vip': Crown,
  'module-vip-modifyTag': Sparkles,
  'business-chat': MessageSquare,
  'business-discovery': Compass,
  'business-safeCenter': ShieldCheck,
  'business-serviceCenter': HelpCircle,
  'business-whitePaper': FileText,

  // 活动靓号
  'activity-vipNumber': Crown,
  'activity-redPacket': Gift,
  'activity-invite': Sparkles,
  'activity-lottery': Gift,

  // 支持调试
  'dev-testPage': Bug,
  'dev-bridgeDebug': Wrench,
  'dev-vConsole': Terminal,
  'support-tradepwd-appeal': Lock,
  'support-iForget': KeyRound
}

// 分类兜底图标
const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  financial: TrendingUp,
  asset: Wallet,
  business: Layers,
  activity: Sparkles,
  dev: Wrench
}

interface ModuleIconProps {
  moduleId?: string
  category?: string
  className?: string
}

export function ModuleIcon({ moduleId, category, className = 'w-4 h-4' }: ModuleIconProps) {
  let IconComponent: LucideIcon | undefined

  if (moduleId && MODULE_ICON_MAP[moduleId]) {
    IconComponent = MODULE_ICON_MAP[moduleId]
  } else if (category && CATEGORY_ICON_MAP[category]) {
    IconComponent = CATEGORY_ICON_MAP[category]
  } else {
    IconComponent = Layers
  }

  return <IconComponent className={className} />
}
