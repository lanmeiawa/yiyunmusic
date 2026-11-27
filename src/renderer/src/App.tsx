import React, { lazy, Suspense, useEffect } from 'react'
import { AppProvider, useApp } from './store'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import DiscoverView from './components/DiscoverView'
import PlayerBar from './components/PlayerBar'
import LoginModal from './components/LoginModal'
import DisclaimerModal from './components/DisclaimerModal'
import mitiaImg from './assets/mitia.png'
// 米提亚主题定制素材（经 Vite 处理为 URL，注入 CSS 变量供各控件统一引用）
import wallpaper from './assets/mitia-wallpaper.jpg'
import sidebarBg from './assets/mitia-sidebar.png'
import topbarBg from './assets/mitia-topbar.png'
import cardBg from './assets/mitia-card.png'
import loginBg from './assets/mitia-login.png'
import menuBg from './assets/mitia-menu.png'
// 首屏之外的页面按需加载：首屏只解析真正会用到的那几个组件，
// 其余页面在浏览器空闲时预热，切换时和同步加载一样快。
const PlaylistView = lazy(() => import('./components/PlaylistView'))
const LyricsView = lazy(() => import('./components/LyricsView'))
const SearchView = lazy(() => import('./components/SearchView'))
const HistoryView = lazy(() => import('./components/HistoryView'))
const SettingsView = lazy(() => import('./components/SettingsView'))
const RadioView = lazy(() => import('./components/RadioView'))
const ProfileView = lazy(() => import('./components/ProfileView'))
const LocalView = lazy(() => import('./components/LocalView'))
const OnlineRadioView = lazy(() => import('./components/OnlineRadioView'))
const FmView = lazy(() => import('./components/FmView'))
const DownloadModal = lazy(() => import('./components/DownloadModal'))

/** 空闲时预热全部按需页面，保证切换视图没有等待 */
function usePrefetchViews() {
  useEffect(() => {
    const warm = () => {
      void import('./components/PlaylistView')
      void import('./components/LyricsView')
      void import('./components/SearchView')
      void import('./components/HistoryView')
      void import('./components/SettingsView')
      void import('./components/RadioView')
      void import('./components/ProfileView')
      void import('./components/LocalView')
      void import('./components/OnlineRadioView')
      void import('./components/FmView')
      void import('./components/DownloadModal')
    }
    const ric = (window as any).requestIdleCallback
    if (typeof ric === 'function') {
      const id = ric(warm, { timeout: 2500 })
      return () => (window as any).cancelIdleCallback?.(id)
    }
    const t = setTimeout(warm, 1200)
    return () => clearTimeout(t)
  }, [])
}

// 仅 mitia 主题注入：把素材 URL 作为 CSS 变量挂在 .app-root 上，
// 这样无需改动各子组件即可让标题栏/侧边栏/卡片/菜单/登录层引用定制素材
const mitiaVars = {
  '--mitia-wallpaper': `url(${wallpaper})`,
  '--mitia-sidebar': `url(${sidebarBg})`,
  '--mitia-topbar': `url(${topbarBg})`,
  '--mitia-card': `url(${cardBg})`,
  '--mitia-login': `url(${loginBg})`,
  '--mitia-menu': `url(${menuBg})`
} as React.CSSProperties

function Main() {
  const { view, authReady, loginOpen, message, theme, bgData, customization, immersive } = useApp()
  const isMitia = theme === 'mitia'
  const isCustom = theme === 'custom'
  // 背景应用范围：bgAll 开启时，任意主题（mitia/light/dark）都显示用户背景
  usePrefetchViews()

  return (
    <div className={`app-root layout-${customization.layout || 'classic'} ${immersive ? 'immersive-full' : ''}`} style={isMitia ? mitiaVars : undefined}>
      {/* 全屏壁纸背景层：mitia 用内置壁纸，custom 用用户上传的背景图 */}
      {(isMitia || isCustom || (customization.bgAll && !!bgData)) && (
        <div
          className="app-bg"
          style={bgData && (isCustom || customization.bgAll) ? { backgroundImage: `url(${bgData})`, filter: `blur(${customization.blur}px) saturate(1.1)`, transform: 'scale(1.08)' } : undefined}
        />
      )}
      {/* 液态玻璃光斑层（全局动画背景） */}
      <div className="glass-lights">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
      </div>
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="content">
          {isMitia && (
            <>
              <div className="mitia-stars" />
              <div className="mitia-deco" style={{ backgroundImage: `url(${mitiaImg})` }} />
            </>
          )}
          <Suspense fallback={null}>
            {view === 'discover' && <DiscoverView />}
            {view === 'playlist' && <PlaylistView />}
            {view === 'lyrics' && <LyricsView />}
            {view === 'search' && <SearchView />}
            {view === 'history' && <HistoryView />}
            {view === 'settings' && <SettingsView />}
            {view === 'radio' && <RadioView />}
            {view === 'profile' && <ProfileView />}
            {view === 'local' && <LocalView />}
            {view === 'onlineRadio' && <OnlineRadioView />}
            {view === 'fm' && <FmView />}
          </Suspense>
        </main>
      </div>
      <PlayerBar />

      {authReady && <DisclaimerModal />}
      {authReady && loginOpen && <LoginModal />}
      <Suspense fallback={null}>
        <DownloadModal />
      </Suspense>
      {message && <div className="toast">{message}</div>}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Main />
    </AppProvider>
  )
}
