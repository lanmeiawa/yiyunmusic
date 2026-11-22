import React, { useState } from 'react'
import { useApp } from '../store'
import {
  IconHome, IconList, IconMusic, IconHeart, IconVip, IconClock, IconPalette, IconFM
} from './Icons'
import { IconMonitor } from './IconsExtra'

/**
 * 左侧导航：按「音乐 / 我的 / 歌单 / 系统」分组，
 * 底部用户区支持多账号切换、添加账号与移除账号。
 */
export default function Sidebar() {
  const {
    profile, playlists, view, setView, openPlaylist, currentPlaylistId, logout,
    t, accounts, switchAccount, removeAccount, openLogin, fmNext
  } = useApp()
  const [accountOpen, setAccountOpen] = useState(false)

  const navItem = (label: string, icon: React.ReactNode, active: boolean, onClick: () => void) => (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick} title={label}>
      {icon}
      <span>{label}</span>
    </button>
  )

  return (
    <aside className="sidebar">
      <div className="side-group">
        <div className="side-section-title"><span>{t('nav.library')}</span></div>
        <div className="side-nav">
          {navItem(t('nav.discover'), <IconHome size={19} />, view === 'discover', () => setView('discover'))}
          {navItem(t('nav.lyrics'), <IconMusic size={19} />, view === 'lyrics', () => setView('lyrics'))}
          {navItem(t('nav.fm'), <IconFM size={19} />, false, () => fmNext())}
          {navItem(t('nav.history'), <IconClock size={19} />, view === 'history', () => setView('history'))}
        </div>
      </div>

      <div className="side-group">
        <div className="side-section-title"><span>{t('nav.mine')}</span></div>
        <div className="side-nav">
          {navItem(t('nav.local'), <IconList size={19} />, view === 'local', () => setView('local'))}
          {navItem(t('nav.radio'), <IconVip size={19} />, view === 'radio', () => setView('radio'))}
          {navItem(t('nav.onlineRadio'), <IconMonitor size={19} />, view === 'onlineRadio', () => setView('onlineRadio'))}
          {navItem(t('nav.profile'), <IconHeart size={19} />, view === 'profile', () => setView('profile'))}
        </div>
      </div>

      <div className="side-section-title">
        <span>{t('nav.myPlaylists')}</span>
        <span className="side-count">{playlists.length}</span>
      </div>

      <div className="playlist-scroll">
        {playlists.map((pl) => {
          const isLiked = pl.specialType === 1 || pl.name === '我喜欢的音乐'
          return (
            <button
              key={pl.id}
              className={`playlist-item ${currentPlaylistId === pl.id && view === 'playlist' ? 'active' : ''}`}
              onClick={() => openPlaylist(pl.id)}
              title={pl.name}
            >
              <span className={`playlist-item-icon ${isLiked ? 'liked' : ''}`}>
                {isLiked ? <IconHeart size={15} fill="currentColor" /> : <IconMusic size={15} />}
              </span>
              <span className="playlist-item-name">{pl.name}</span>
            </button>
          )
        })}
        {playlists.length === 0 && <div className="side-empty">{t('side.loginHint')}</div>}
      </div>

      <div className="side-footer">
        <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}>
          <IconPalette size={19} />
          <span>{t('nav.settings')}</span>
        </button>

        {profile ? (
          <div className="side-user">
            <img src={profile.avatarUrl} alt="" className="user-avatar" />
            <div className="user-meta">
              <div className="user-name">
                <span className="user-nickname" title={profile.nickname}>{profile.nickname}</span>
                {profile.vipType > 0 && <span className="vip-badge"><IconVip size={11} /> VIP</span>}
              </div>
              <button className="logout-btn" onClick={() => setAccountOpen((v) => !v)}>
                {t('side.accounts')} · {accounts.length}
              </button>
            </div>

            {accountOpen && (
              <div className="account-menu">
                <div className="account-menu-title">{t('side.accounts')}</div>
                {accounts.map((a) => {
                  const active = String(profile.userId) === a.id
                  return (
                    <button
                      key={a.id}
                      className={`account-row ${active ? 'active' : ''}`}
                      onClick={async () => { await switchAccount(a.id); setAccountOpen(false) }}
                    >
                      <img src={a.avatarUrl} alt="" className="account-avatar" />
                      <span className="account-name">{a.nickname}</span>
                      {active && <em className="account-current">{t('side.current')}</em>}
                      <span
                        className="account-remove"
                        title="移除"
                        onClick={(e) => { e.stopPropagation(); removeAccount(a.id) }}
                      >✕</span>
                    </button>
                  )
                })}
                {accounts.length === 0 && <div className="account-empty">{t('side.noAccounts')}</div>}
                <button className="account-add" onClick={() => { setAccountOpen(false); openLogin() }}>
                  ＋ {t('side.addAccount')}
                </button>
                <button className="account-logout" onClick={() => { setAccountOpen(false); logout() }}>
                  {t('side.logout')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <button className="side-login" onClick={openLogin}>{t('side.login')}</button>
        )}
      </div>
    </aside>
  )
}
