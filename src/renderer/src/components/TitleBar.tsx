import React, { useEffect, useRef, useState } from 'react'
import { IconMinimize, IconMaximize, IconClose, IconMusic, IconChevronLeft, IconSearch } from './Icons'
import { IconSun, IconMoon, IconStar, IconPalette, IconMonitor } from './IconsExtra'
import { useApp } from '../store'
import type { ThemeName } from '../types'

const THEMES: { key: ThemeName; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: 'light', label: '明亮', desc: '简洁清爽', icon: <IconSun size={17} /> },
  { key: 'dark', label: '暗夜', desc: '深沉护眼', icon: <IconMoon size={17} /> },
  { key: 'mitia', label: '米提亚', desc: '原神二次元', icon: <IconStar size={17} /> },
  { key: 'custom', label: '自定义', desc: '上传你的背景图', icon: <IconPalette size={17} /> }
]

export default function TitleBar() {
  const [isMax, setIsMax] = useState(false)
  const [query, setQuery] = useState('')
  const [themeOpen, setThemeOpen] = useState(false)
  const {
    view, setView, currentPlaylistId, doSearch, theme, setTheme, desktopLyrics, toggleDesktopLyrics, customization,
    searchHistory, clearSearchHistory, removeSearchHistory, t
  } = useApp()

  // 热搜与搜索建议
  const [hotList, setHotList] = useState<string[]>([])
  const [sugList, setSugList] = useState<string[]>([])
  const [searchPanelOpen, setSearchPanelOpen] = useState(false)
  const loadHotSearch = async () => {
    setSearchPanelOpen(true)
    if (hotList.length) return
    try {
      const res = await window.eApi.call('search_hot_detail', {})
      setHotList((res?.data || []).slice(0, 10).map((x: any) => x.searchWord))
    } catch { /* 热搜加载失败静默 */ }
  }
  const sugTimer = useRef<any>(null)
  const loadSuggest = (kw: string) => {
    clearTimeout(sugTimer.current)
    if (!kw.trim()) { setSugList([]); return }
    sugTimer.current = setTimeout(async () => {
      try {
        const res = await window.eApi.call('search_suggest', { keywords: kw.trim() })
        setSugList((res?.result?.songs || []).slice(0, 6).map((s: any) => s.name))
        setSearchPanelOpen(true)
      } catch { setSugList([]) }
    }, 300)
  }

  useEffect(() => {
    window.eApi.win.isMax().then(setIsMax).catch(() => {})
  }, [])

  // 点击空白处关闭主题菜单
  useEffect(() => {
    if (!themeOpen) return
    const close = () => setThemeOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [themeOpen])

  const goBack = () => {
    if (view === 'lyrics' || view === 'search' || view === 'history') setView(currentPlaylistId ? 'playlist' : 'discover')
    else if (view === 'playlist') setView('discover')
  }

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchPanelOpen(false)
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
    if (query.trim()) doSearch(query)
  }

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <div className="titlebar-brand">
          <span className={`brand-logo ${customization.iconPath ? 'custom' : ''}`}>
            {customization.iconPath
              ? <img src={`file:///${customization.iconPath.replace(/\\/g, '/')}`} alt="" />
              : <IconMusic size={18} />}
          </span>
          <span className="brand-name">{customization.appName || 'yiyunmusic'}</span>
        </div>
        {(view === 'playlist' || view === 'lyrics' || view === 'search' || view === 'history') && (
          <button className="titlebar-back" onClick={goBack} title="返回">
            <IconChevronLeft size={18} />
          </button>
        )}
      </div>

      {/* 中间：搜索框（聚焦显示热搜，输入显示建议） */}
      <form className="titlebar-search" onSubmit={submitSearch}>
        <IconSearch size={15} />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); loadSuggest(e.target.value) }}
          onFocus={loadHotSearch}
          onBlur={() => setTimeout(() => setSearchPanelOpen(false), 200)}
          placeholder={t('search.placeholder')}
          spellCheck={false}
        />
        {searchPanelOpen && (query.trim() === '' ? (searchHistory.length > 0 || hotList.length > 0) : sugList.length > 0) && (
          <div className="search-suggest-panel" onClick={(e) => e.stopPropagation()}>
            {query.trim() === '' && searchHistory.length > 0 && (
              <>
                <div className="search-panel-title">
                  {t('search.history')}
                  <button className="panel-clear" onClick={clearSearchHistory}>{t('search.clear')}</button>
                </div>
                {searchHistory.map((w) => (
                  <button key={w} className="search-sug-row history" onClick={() => { doSearch(w); setSearchPanelOpen(false); setQuery('') }}>
                    <span className="history-dot">↺</span>
                    <span className="hot-word">{w}</span>
                    <span
                      className="history-del"
                      title="删除这条历史"
                      onClick={(e) => { e.stopPropagation(); removeSearchHistory(w) }}
                    >✕</span>
                  </button>
                ))}
              </>
            )}
            {query.trim() === '' && hotList.length > 0 && (
              <>
                <div className="search-panel-title">🔥 {t('search.hot')}</div>
                {hotList.map((w, i) => (
                  <button key={w} className="search-sug-row" onClick={() => { doSearch(w); setSearchPanelOpen(false); setQuery('') }}>
                    <span className="hot-rank">{i + 1}</span>
                    <span className="hot-word">{w}</span>
                  </button>
                ))}
              </>
            )}
            {query.trim() !== '' && sugList.length > 0 && (
              <>
                <div className="search-panel-title">{t('search.suggest')}</div>
                {sugList.map((name) => (
                  <button key={name} className="search-sug-row" onClick={() => { doSearch(name); setSearchPanelOpen(false); setQuery('') }}>
                    <span className="hot-word">{name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </form>

      <div className="titlebar-tools" onClick={(e) => e.stopPropagation()}>
        {/* 桌面歌词开关 */}
        <button
          className={`tb-tool ${desktopLyrics.enabled ? 'active' : ''}`}
          onClick={toggleDesktopLyrics}
          title={desktopLyrics.enabled ? '关闭桌面歌词' : '开启桌面歌词'}
        >
          <IconMonitor size={17} />
        </button>

        {/* 主题切换 */}
        <div className="theme-switcher">
          <button className="tb-tool" onClick={() => setThemeOpen((v) => !v)} title="切换主题">
            <IconPalette size={17} />
          </button>
          {themeOpen && (
            <div className="theme-menu" onClick={(e) => e.stopPropagation()}>
              <div className="theme-menu-title">选择主题</div>
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  className={`theme-option ${theme === t.key ? 'active' : ''}`}
                  onClick={() => {
                    setTheme(t.key)
                    setThemeOpen(false)
                    if (t.key === 'custom') setView('settings')
                  }}
                >
                  <span className={`theme-option-icon ${t.key}`}>{t.icon}</span>
                  <span className="theme-option-text">
                    <b>{t.label}</b>
                    <small>{t.desc}</small>
                  </span>
                  {theme === t.key && <span className="theme-check">✓</span>}
                </button>
              ))}
              <button
                className="theme-option settings-entry"
                onClick={() => { setThemeOpen(false); setView('settings') }}
              >
                <span className="theme-option-icon custom">⚙</span>
                <span className="theme-option-text">
                  <b>个性化设置</b>
                  <small>背景图 · 主题色 · 布局</small>
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="titlebar-controls">
          <button onClick={() => window.eApi.win.minimize()} title="最小化"><IconMinimize size={16} /></button>
          <button onClick={() => { window.eApi.win.maximize(); setIsMax(!isMax) }} title={isMax ? '还原' : '最大化'}>
            <IconMaximize size={15} />
          </button>
          <button className="close" onClick={() => window.eApi.win.close()} title="关闭"><IconClose size={17} /></button>
        </div>
      </div>
    </div>
  )
}
