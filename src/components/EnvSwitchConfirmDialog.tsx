import React from 'react'
import { AlertTriangle, ArrowRight, ShieldAlert, LogOut, X } from 'lucide-react'
import { ENV_MODES, type EnvMode } from '../config/modules'
import { cn } from '../lib/utils'

interface EnvSwitchConfirmDialogProps {
  open: boolean
  currentEnv: EnvMode
  targetEnv: EnvMode
  onConfirm: () => void
  onClose: () => void
}

export function EnvSwitchConfirmDialog({
  open,
  currentEnv,
  targetEnv,
  onConfirm,
  onClose
}: EnvSwitchConfirmDialogProps) {
  if (!open) return null

  const currentPreset = ENV_MODES[currentEnv] || ENV_MODES.prod
  const targetPreset = ENV_MODES[targetEnv] || ENV_MODES.test

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景毛玻璃遮罩 */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* 对话框主体 */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 dark:bg-slate-900 dark:ring-slate-800 animate-in zoom-in-95 duration-150">
        {/* 顶部醒目警示色条 */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" />

        <div className="p-6">
          {/* 关闭按钮 */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* 头部图标与标题 */}
          <div className="flex items-start gap-3.5 mb-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60 shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                切换运行环境确认
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                请确认是否切换至目标环境并重新登录
              </p>
            </div>
          </div>

          {/* 环境对比条目 */}
          <div className="my-4 flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 border border-slate-200/80 dark:bg-slate-800/60 dark:border-slate-700/60">
            {/* 当前环境 */}
            <div className="flex-1 text-center">
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                当前环境
              </div>
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                {currentPreset.label}
              </div>
              <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                {currentPreset.h5BaseUrl.replace('https://', '')}
              </div>
            </div>

            {/* 箭头 */}
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white shadow-xs border border-slate-200 text-slate-400 dark:bg-slate-700 dark:border-slate-600">
              <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
            </div>

            {/* 目标环境 */}
            <div className="flex-1 text-center">
              <div className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">
                目标环境
              </div>
              <div className="text-xs font-bold text-blue-600 dark:text-blue-400 truncate">
                {targetPreset.label}
              </div>
              <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                {targetPreset.h5BaseUrl.replace('https://', '')}
              </div>
            </div>
          </div>

          {/* 账号不通用重点警示框 */}
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="space-y-1 text-xs leading-relaxed">
                <p className="font-semibold text-amber-950 dark:text-amber-100">
                  ⚠️ 账号及登录凭据不通用说明
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  正式环境（<code className="text-[11px] font-mono px-1 py-0.2 bg-amber-100 dark:bg-amber-900/50 rounded">.info</code>）与测试环境（<code className="text-[11px] font-mono px-1 py-0.2 bg-amber-100 dark:bg-amber-900/50 rounded">.buzz</code>）为完全独立部署的服务端体系，
                  <strong className="text-amber-900 dark:text-amber-200"> 账号、密码及 Token 互不相通</strong>。
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] pt-0.5">
                  确认切换后将<strong className="text-rose-600 dark:text-rose-400"> 强制退出当前工作区并返回登录页</strong>，请重新输入对应环境的账号密码登录。
                </p>
              </div>
            </div>
          </div>

          {/* 底部按钮栏 */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              取消，留在当前环境
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-md shadow-orange-500/20 active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>确认切换并返回登录页</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
