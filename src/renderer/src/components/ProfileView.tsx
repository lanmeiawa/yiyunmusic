import React, { useEffect, useState } from 'react'
import { useApp } from '../store'
import { formatTime } from '../utils/lrc'
import { coverUrl } from '../utils/cover'
import NetImg from './NetImg'
import { IconPlay, IconVip, IconMusic } from './Icons'

interface RecItem { id: number; name: string; artist: string; pic: string; score: number; duration?: number }

/**
 * 个人主页——针对官方主页痛点做的完善版：
 * 一页直达（无多级跳转）· 听歌排行置顶 · 最近播放可直接回放 · 无动态/社交杂讯
 */
export default function ProfileView() {
  const { profile, playlists, openPlaylist, openLogin, playTrack, setMessage } = useApp()
  const [detail, setDetail] = useState<any>(null)
  const [level, setLevel] = useState<number>(0)
  const [vip, setVip] = useState<{ isVip: boolean; type: string } | null>(null)
  const [week, setWeek] = useState(true)
  const [records, setRecords] = useState<RecItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!profile) return
    ;(async () => {
      try {
        const d = await window.eApi.call('user_detail', { uid: profile.userId })
        setDetail(d?.profile || null)
        const l = await window.eApi.call('user_level', {})
        setLevel(l?.data?.level || 0)
        const v = await window.eApi.call('vip_info', {})
        setVip({ isVip: !!(v?.data?.redVipLevel || v?.data?.redVipCurrentLevel), type: '黑胶VIP' })
      } catch { }
    })()
  }, [profile?.userId])

  // 听歌排行（week: true 周 / false 总）
  const loadRecords = async (isWeek: boolean) => {
    setWeek(isWeek)
    setLoading(true)
    try {
      const res = await window.eApi.call('user_record', { uid: profile?.userId, type: isWeek ? 1 : 0 })
      const list = (res?.weekData || res?.allData || []).slice(0, 10).map((x: any) => {
        const s = x.song || {}
        return {
          id: s.id,
          name: s.name || '',
          artist: (s.ar || s.artists || []).map((a: any) => a.name).join('/') || '未知',
          pic: (s.al || s.album)?.picUrl || '',
          score: x.playCount || 0,
          duration: s.dt || s.duration || 0
        }
      })
      setRecords(list)
    } catch { setRecords([]) }
    setLoading(false)
  }

  useEffect(() => { if (profile?.userId) loadRecords(true) }, [profile?.userId])

  if (!profile) {
    return (
      <div className="profile-view">
        <div className="profile-empty">
          <IconMusic size={34} />
          <p>登录后可查看你的个人主页：听歌排行、最近播放、我的歌单一站式呈现</p>
          <button className="hero-login-btn" onClick={openLogin}><IconPlay size={14} /> 立即扫码登录</button>
        </div>
      </div>
    )
  }

  const playRec = (item: RecItem) => {
    // 把当前排行列表作为上下文连播
    const tracks = records.map((r) => ({
      id: r.id, name: r.name,
      artists: [{ id: 0, name: r.artist }],
      album: { id: 0, name: '', picUrl: r.pic },
      duration: (r.duration || 0) * 1, fee: 0, mv: 0, alias: []
    }))
    const t = tracks.find((x) => x.id === item.id)
    if (t) playTrack(t, tracks)
    else setMessage('这首歌曲暂时无法播放')
  }

  return (
    <div className="profile-view">
      {/* 头部卡片：头像/昵称/等级/VIP/数据 */}
      <div className="profile-hero">
        <NetImg className="profile-avatar" src={detail?.avatarUrl || ''} />
        <div className="profile-meta">
          <div className="profile-name-row">
            <h1>{profile.nickname}</h1>
            {level > 0 && <span className="profile-level">Lv.{level}</span>}
            {vip?.isVip && <span className="profile-vip"><IconVip size={11} /> {vip.type}</span>}
          </div>
          <div className="profile-stats">
            <span><b>{detail?.listenSongs ?? '—'}</b> 累计听歌</span>
            <span><b>{detail?.playlistCount ?? playlists.length}</b> 歌单</span>
            <span><b>{detail?.follows ?? '—'}</b> 关注</span>
            <span><b>{detail?.followeds ?? '—'}</b> 粉丝</span>
          </div>
          {detail?.signature && <div className="profile-sign">{detail.signature}</div>}
        </div>
      </div>

      {/* 听歌排行（官方藏得深，这里置顶且可回放） */}
      <section className="profile-section">
        <div className="section-head">
          <h2>听歌排行</h2>
          <div className="profile-week-tabs">
            <button className={`settings-chip ${week ? 'sel' : ''}`} onClick={() => loadRecords(true)}>最近一周</button>
            <button className={`settings-chip ${!week ? 'sel' : ''}`} onClick={() => loadRecords(false)}>所有时间</button>
          </div>
        </div>
        <div className="pl-rows profile-rows">
          {loading && Array.from({ length: 5 }).map((_, i) => <div key={i} className="sk-row" />)}
          {!loading && records.length === 0 && <div className="radio-empty">暂无听歌记录</div>}
          {!loading && records.map((r, i) => (
            <div key={`${r.id}-${i}`} className="pl-row rec-row" onDoubleClick={() => playRec(r)}>
              <span className="col-index">
                <span className="row-cover"><NetImg src={coverUrl(r.pic, 80)} /></span>
                <span className="index-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-play" onClick={() => playRec(r)}><IconPlay size={14} /></span>
              </span>
              <span className="col-title"><span className="track-name">{r.name}</span></span>
              <span className="col-album">{r.artist}</span>
              <span className="col-time rec-score">{r.score} 次</span>
            </div>
          ))}
        </div>
      </section>

      {/* 我的歌单（横向卡片，直达歌单） */}
      <section className="profile-section">
        <div className="section-head">
          <h2>我的歌单</h2>
          <span>{playlists.length} 个</span>
        </div>
        <div className="album-grid">
          {playlists.slice(0, 8).map((pl) => (
            <button key={pl.id} className="album-card" onClick={() => openPlaylist(pl.id)}>
              <div className="album-cover">
                <NetImg src={coverUrl(pl.coverImgUrl, 300)} alt={pl.name} />
                <span className="album-play"><IconPlay size={18} /></span>
              </div>
              <div className="album-name" title={pl.name}>{pl.name}</div>
              <div className="album-artist">{pl.trackCount} 首</div>
            </button>
          ))}
          {playlists.length === 0 && <div className="radio-empty">登录后同步你的歌单</div>}
        </div>
      </section>
    </div>
  )
}
