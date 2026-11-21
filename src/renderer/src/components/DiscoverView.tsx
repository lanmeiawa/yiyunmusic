import React, { useEffect, useState } from 'react'
import { useApp } from '../store'
import type { Playlist } from '../types'
import { IconMusic, IconPlay } from './Icons'
import { IconFire } from './IconsExtra'
import { coverUrl } from '../utils/cover'
import NetImg from './NetImg'

export default function DiscoverView() {
  const { profile, playlists, openPlaylist, openLogin, customization, playTrack, setView } = useApp()
  const [dailyCount, setDailyCount] = useState(0)
  const [dailyLoading, setDailyLoading] = useState(false)
  // 每日推荐卡片数据（拉一次数量与封面）
  const loadDaily = async () => {
    setDailyLoading(true)
    try {
      const res = await window.eApi.call('recommend_songs', {})
      const songs = res?.data?.dailySongs || []
      setDailyCount(songs.length)
      setDailyCover(songs[0]?.al?.picUrl || songs[0]?.album?.picUrl || '')
      setDailySongsCache(songs)
    } catch { setDailyCount(0) }
    setDailyLoading(false)
  }
  const [dailyCover, setDailyCover] = useState('')
  const [dailySongsCache, setDailySongsCache] = useState<any[]>([])
  useEffect(() => { loadDaily() }, [profile?.userId])
  const [recommend, setRecommend] = useState<Playlist[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        // 个性化推荐歌单（返回的是真实歌单 id，点击可直接打开歌单详情）
        const res = await window.eApi.call('personalized', { limit: 8 })
        const list = res?.result || []
        setRecommend(
          list.slice(0, 8).map((a: any) => ({
            id: a.id,
            name: a.name,
            coverImgUrl: a.picUrl || a.coverImgUrl,
            trackCount: a.trackCount || a.size || 0,
            playCount: a.playCount || 0,
            creator: a.creator ? { nickname: a.creator.nickname } : undefined
          }))
        )
      } catch {
        /* 发现页推荐加载失败不影响主流程 */
      }
    })()
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

  return (
    <div className="discover">
      <div className="discover-hero">
        <div className="hero-text">
          <h1 style={customization.welcomeColor ? { color: customization.welcomeColor } : undefined}>{greeting}{profile ? `，${profile.nickname}` : ''} <span className="wave">👋</span></h1>
          <p>{profile ? '今天想听点什么？ Your music, your moment.' : '扫码登录，开启属于你的音乐旅程'}</p>
          {!profile && (
            <button className="hero-login-btn" onClick={openLogin}>
              <IconMusic size={15} /> 立即扫码登录
            </button>
          )}
        </div>
        <div className="hero-orb"><IconMusic size={54} /></div>
      </div>

      <div className="discover-quick">
        <button
          className="quick-card daily"
          onClick={async () => {
            // 未登录也可用（recommend_songs 未登录同样返回每日 30 首）
            setDailyLoading(true)
            // 优先用已缓存的推荐列表（避免接口限频导致点击无效）
            let songs = dailySongsCache
            if (!songs.length) {
              try {
                const res = await window.eApi.call('recommend_songs', {})
                songs = (res?.data?.dailySongs || []).map((s: any) => ({
                  id: s.id, name: s.name,
                  artists: (s.ar || s.artists || []).map((a: any) => ({ id: a.id, name: a.name })),
                  album: { id: (s.al || s.album)?.id || 0, name: (s.al || s.album)?.name || '', picUrl: (s.al || s.album)?.picUrl || '' },
                  duration: s.dt || s.duration || 0, fee: s.fee, mv: s.mv, alias: s.alias
                }))
                setDailySongsCache(songs)
              } catch { }
            }
            if (songs.length) { await playTrack(songs[0], songs); setView('lyrics') }
            else setMessage('每日推荐加载失败，请稍后再试')
            setDailyLoading(false)
          }}
        >
          <span className="quick-icon">📅</span>
          <span className="quick-text"><b>每日推荐</b><i>{dailyLoading ? '加载中…' : `${dailyCount || 30} 首为你定制`}</i></span>
          <span className="quick-play"><IconPlay size={15} /></span>
        </button>
        <button
          className="quick-card chart"
          onClick={async () => {
            setDailyLoading(true)
            try {
              const res = await window.eApi.call('toplist', {})
              // 找热歌榜（id 3778678 网易云热歌榜）
              const hot = (res?.list || []).find((x: any) => x.id === 3778678) || (res?.list || [])[0]
              if (hot?.id) openPlaylist(hot.id)
            } catch { }
            setDailyLoading(false)
          }}
        >
          <span className="quick-icon">🔥</span>
          <span className="quick-text"><b>热歌排行榜</b><i>全网最热单曲</i></span>
          <span className="quick-play"><IconPlay size={15} /></span>
        </button>
        <button
          className="quick-card radio"
          onClick={() => setView('radio')}
        >
          <span className="quick-icon">📻</span>
          <span className="quick-text"><b>听书电台</b><i>热门节目随时听</i></span>
          <span className="quick-play"><IconPlay size={15} /></span>
        </button>
        <button
          className="quick-card local"
          onClick={() => setView('local')}
        >
          <span className="quick-icon">🎵</span>
          <span className="quick-text"><b>本地音乐</b><i>扫描本机音频播放</i></span>
          <span className="quick-play"><IconPlay size={15} /></span>
        </button>
      </div>

      <div className="discover-section">
        <div className="section-head">
          <h2><IconFire size={19} /> 热门推荐</h2>
          <span>为你精选</span>
        </div>
        <div className="album-grid">
          {recommend.map((item) => (
            <button key={item.id} className="album-card" onClick={() => openPlaylist(item.id)}>
              <div className="album-cover">
                <NetImg src={coverUrl(item.coverImgUrl, 300)} alt={item.name} />
                <span className="album-play"><IconPlay size={18} /></span>
              </div>
              <div className="album-name" title={item.name}>{item.name}</div>
              <div className="album-artist">{item.creator?.nickname || '网易云音乐'}</div>
            </button>
          ))}
          {recommend.length === 0 && Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="album-card skeleton-card">
              <div className="album-cover" />
              <div className="album-name" />
            </div>
          ))}
        </div>
      </div>

      {playlists.length > 0 && (
        <div className="discover-section">
          <div className="section-head">
            <h2><IconMusic size={19} /> 我的歌单</h2>
            <span>{playlists.length} 个歌单</span>
          </div>
          <div className="album-grid">
            {playlists.slice(0, 8).map((pl) => (
              <button key={pl.id} className="album-card" onClick={() => openPlaylist(pl.id)}>
                <div className="album-cover">
                  <NetImg src={coverUrl(pl.coverImgUrl, 300)} alt={pl.name} />
                  <span className="album-play"><IconPlay size={18} /></span>
                </div>
                <div className="album-name" title={pl.name}>{pl.name}</div>
                <div className="album-artist">{pl.trackCount} 首歌曲</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
