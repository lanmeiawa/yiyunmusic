import React from 'react'
import { AppProvider, useApp } from './store'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import DiscoverView from './components/DiscoverView'
import PlaylistView from './components/PlaylistView'
import LyricsView from './components/LyricsView'
import SearchView from './components/SearchView'
import HistoryView from './components/HistoryView'
import SettingsView from './components/SettingsView'
import RadioView from './components/RadioView'
import ProfileView from './components/ProfileView'
import LocalView from './components/LocalView'
import OnlineRadioView from './components/OnlineRadioView'
import FmView from './components/FmView'
import PlayerBar from './components/PlayerBar'
import LoginModal from './components/LoginModal'
import DisclaimerModal from './components/DisclaimerModal'
import DownloadModal from './components/DownloadModal'
import mitiaImg from './assets/mitia.png'
// 米提亚主题定制素材（经 Vite 处理为 URL，注入 CSS 变量供各控件统一引用）
import wallpaper from './assets/mitia-wallpaper.jpg'
import sidebarBg from './assets/mitia-sidebar.png'
import topbarBg from './assets/mitia-topbar.png'
import cardBg from './assets/mitia-card.png'
import loginBg from './assets/mitia-login.png'
import menuBg from './assets/mitia-menu.png'

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
        </main>
      </div>
      <PlayerBar />

      {authReady && <DisclaimerModal />}
      {authReady && loginOpen && <LoginModal />}
      <DownloadModal />
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
