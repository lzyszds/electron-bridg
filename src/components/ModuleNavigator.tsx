import { useState, useMemo } from 'react'
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Server
} from 'lucide-react'
import {
  H5_MODULES,
  MODULE_CATEGORIES,
  BASE_URL_PRESETS,
  type H5Module
} from '../config/modules'
import { ModuleIcon } from './ModuleIcon'
import { cn } from '../lib/utils'

interface ModuleNavigatorProps {
  currentModuleId: string
  currentBaseUrl: string
  onSelectModule: (module: H5Module) => void
  onChangeBaseUrl?: (baseUrl: string) => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

export function ModuleNavigator({
  currentModuleId,
  currentBaseUrl,
  onSelectModule,
  onChangeBaseUrl,
  isCollapsed = false,
  onToggleCollapse
}: ModuleNavigatorProps) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const filteredModules = useMemo(() => {
    return H5_MODULES.filter((m) => {
      const matchCategory =
        selectedCategory === 'all' || m.category === selectedCategory
      const query = search.trim().toLowerCase()
      const matchSearch =
        !query ||
        m.name.toLowerCase().includes(query) ||
        m.path.toLowerCase().includes(query) ||
        (m.description && m.description.toLowerCase().includes(query))
      return matchCategory && matchSearch
    })
  }, [search, selectedCategory])

  const currentPreset = useMemo(() => {
    return (
      BASE_URL_PRESETS.find((p) =>
        currentBaseUrl.includes(p.value.replace('https://', '').replace('http://', ''))
      ) || BASE_URL_PRESETS[0]
    )
  }, [currentBaseUrl])

  // 折叠精简状态 (Icon-only rail)
  if (isCollapsed) {
    return (
      <aside className="h-full w-14 flex flex-col items-center py-2.5 border-r border-slate-200 bg-white transition-all shrink-0 select-none shadow-xs">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer mb-2"
          title="展开模块侧边栏"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="flex-1 w-full flex flex-col items-center gap-1.5 overflow-y-auto px-1">
          {H5_MODULES.map((m) => {
            const isActive = m.id === currentModuleId
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectModule(m)}
                title={`${m.name} (${m.path})`}
                className={cn(
                  'w-9 h-9 flex items-center justify-center rounded-xl text-base transition-all cursor-pointer relative group',
                  isActive
                    ? 'bg-blue-50 text-blue-600 border border-blue-400 shadow-xs shadow-blue-500/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                )}
              >
                <ModuleIcon moduleId={m.id} category={m.category} className="w-4 h-4" />
                {isActive && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-600" />
                )}
              </button>
            )
          })}
        </div>
      </aside>
    )
  }

  return (
    <aside className="h-full w-64 flex flex-col border-r border-slate-200 bg-white transition-all shrink-0 select-none shadow-xs">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Boxes className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold text-slate-800 tracking-wide">
            H5 模块切换
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            {filteredModules.length}
          </span>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="收起侧边栏"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 搜索输入框 */}
      <div className="p-2.5 border-b border-slate-100">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模块名称或路由..."
            className="w-full h-7 pl-7 pr-6 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:bg-white transition-colors"
          />
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 分类快捷标签 */}
      <div className="flex gap-1 px-2.5 py-2 overflow-x-auto border-b border-slate-100 scrollbar-none">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={cn(
            'px-2.5 py-0.5 rounded-full text-[11px] font-medium shrink-0 transition-all cursor-pointer',
            selectedCategory === 'all'
              ? 'bg-blue-600 text-white font-semibold shadow-xs shadow-blue-500/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 border border-slate-200/60'
          )}
        >
          全部
        </button>
        {MODULE_CATEGORIES.map((c) => {
          const active = selectedCategory === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCategory(c.id)}
              className={cn(
                'px-2.5 py-0.5 rounded-full text-[11px] font-medium shrink-0 transition-all cursor-pointer',
                active
                  ? 'bg-blue-600 text-white font-semibold shadow-xs shadow-blue-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 border border-slate-200/60'
              )}
            >
              {c.name}
            </button>
          )
        })}
      </div>

      {/* 模块卡片列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-slate-50/50">
        {filteredModules.map((module) => {
          const isActive = module.id === currentModuleId
          return (
            <button
              key={module.id}
              type="button"
              onClick={() => onSelectModule(module)}
              className={cn(
                'w-full text-left p-2 rounded-xl border transition-all flex items-start gap-2.5 cursor-pointer group relative',
                isActive
                  ? 'bg-blue-50/90 border-blue-500 shadow-xs text-blue-900'
                  : 'bg-white hover:bg-slate-50 border-slate-200/80 hover:border-slate-300 text-slate-700'
              )}
            >
              {/* 高品质 Lucide 图标容器 */}
              <span
                className={cn(
                  'p-2 rounded-lg border shrink-0 transition-transform group-hover:scale-105 flex items-center justify-center',
                  isActive
                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                )}
              >
                <ModuleIcon moduleId={module.id} category={module.category} className="w-4 h-4" />
              </span>

              {/* 模块信息 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      'text-xs font-semibold truncate',
                      isActive ? 'text-blue-700' : 'text-slate-800'
                    )}
                  >
                    {module.name}
                  </span>
                  {isActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" />
                  )}
                </div>

                <div className="text-[10px] font-mono text-slate-500 truncate mt-0.5">
                  {module.path}
                </div>

                {module.description && (
                  <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                    {module.description}
                  </p>
                )}
              </div>
            </button>
          )
        })}

        {filteredModules.length === 0 && (
          <div className="py-10 text-center text-xs text-slate-400">
            没有匹配的 H5 模块
          </div>
        )}
      </div>

      {/* 底部当前环境指示器 */}
      <div className="p-2.5 border-t border-slate-200 bg-white flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">
              当前环境
            </div>
            <div className="text-[11px] font-mono font-medium text-slate-800 truncate">
              {currentPreset.label.split(' ')[0]}
            </div>
          </div>
        </div>
        {onChangeBaseUrl && (
          <select
            value={currentBaseUrl}
            onChange={(e) => onChangeBaseUrl(e.target.value)}
            className="text-[10px] bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-700 outline-none cursor-pointer focus:border-blue-500"
            title="快速切换基础域名"
          >
            {BASE_URL_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label.split(' ')[0]}
              </option>
            ))}
          </select>
        )}
      </div>
    </aside>
  )
}


