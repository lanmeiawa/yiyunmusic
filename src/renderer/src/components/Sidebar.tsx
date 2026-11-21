import React from 'react'
import { useApp } from '../store'
import {
  IconHome, IconList, IconMusic, IconHeart, IconVip, IconUser, IconClock, IconPalette
} from './Icons'

export default function Sidebar() {
  const { profile, playlists, view, setView, openPlaylist, currentPlaylistId, logout } = useApp()

  return (
    <aside className="sidebar">
      <div className="side-nav">
        <button
          className={`nav-item ${view === 'discover' ? 'active' : ''}`}
          onClick={() => setView('discover')}
        >
          <IconHome size={19} />
          <span>发现音乐</span>
        </button>
        <button className="nav-item" onClick={() => playlists[0] && openPlaylist(playlists[0].id)}>
          <IconList size={19} />
          <span>我的歌单</span>
        </button>
        <button
          className={`nav-item ${view === 'lyrics' ? 'active' : ''}`}
          onClick={() => setView('lyrics')}
        >
          <IconMusic size={19} />
          <span>动态歌词</span>
        </button>
        <button
          className={`nav-item ${view === 'history' ? 'active' : ''}`}
          onClick={() => setView('history')}
        >
          <IconClock size={19} />
          <span>最近播放</span>
        </button>
        <button
          className={`nav-item ${view === 'profile' ? 'active' : ''}`}
          onClick={() => setView('profile')}
        >
          <IconVip size={19} />
          <span>个人主页</span>
        </button>
        <button
          className={`nav-item ${view === 'settings' ? 'active' : ''}`}
          onClick={() => setView('settings')}
        >
          <IconPalette size={19} />
          <span>个性化设置</span>
        </button>
      </div>

      <div className="side-section-title">
        <span>我的歌单</span>
        <span className="side-count">{playlists.length}</span>
      </div>

      <div className="playlist-scroll">
        {playlists.map((pl, i) => {
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
        {playlists.length === 0 && (
          <div className="side-empty">登录后显示歌单</div>
        )}
      </div>

      {profile && (
        <div className="side-user">
          <img src={profile.avatarUrl} alt="" className="user-avatar" />
          <div className="user-meta">
            <div className="user-name">
              <span className="user-nickname" title={profile.nickname}>{profile.nickname}</span>
              {profile.vipType > 0 && <span className="vip-badge"><IconVip size={11} /> VIP</span>}
            </div>
            <button className="logout-btn" onClick={logout}>退出登录</button>
          </div>
        </div>
      )}
    </aside>
  )
}
