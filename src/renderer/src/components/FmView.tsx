import React from 'react'
import { useApp } from '../store'
import { IconPlay, IconMusic, IconFM } from './Icons'
import { formatTime } from '../utils/lrc'
import { coverUrl } from '../utils/cover'
import NetImg from './NetImg'

/**
 * 私人 FM：一次拉 50 首，列表展示，可整批播放 / 换一批。
 * FM 歌会累积到播放队列，列表播完自动再拉一批。
 */
export default function FmView() {
  const { fmTracks, fmLoading, fmMode, player, openFm, loadFm, playFmTrack, fmNext, setMessage } = useApp()

  const playAll = () => {
    if (fmTracks.length) playFmTrack(fmTracks[0])
    else loadFm(false)
  }

  const refresh = async () => {
    const before = fmTracks.length
    const list = await loadFm(false)
    if (list.length) {
      setMessage(list.length > before ? '已换一批私人FM推荐' : '已重新加载推荐')
      playFmTrack(list[0])
    }
  }

  return (
    <div className="fm-view">
      <div className="fm-header">
        <div className="fm-hero">
          <div className="fm-logo"><IconFM size={30} /></div>
          <div>
            <h1>私人 FM</h1>
            <p>根据你的口味随机推荐，一次 50 首 · {fmTracks.length ? `已加载 ${fmTracks.length} 首` : '还没有加载'}</p>
          </div>
        </div>
        <div className="fm-actions">
          <button className="settings-chip sel" onClick={playAll} disabled={fmLoading}>
            <IconPlay size={13} /> 播放全部
          </button>
          <button className="settings-chip" onClick={refresh} disabled={fmLoading}>
            {fmLoading ? '加载中…' : '换一批'}
          </button>
          <button className="settings-chip" onClick={() => fmNext()} disabled={fmLoading || !fmTracks.length}>
            下一首
          </button>
        </div>
      </div>

      {fmLoading && fmTracks.length === 0 && (
        <div className="fm-skeleton">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="pl-row-skeleton" />)}
        </div>
      )}

      {!fmLoading && fmTracks.length === 0 && (
        <div className="fm-empty">
          <IconMusic size={40} />
          <p>还没有推荐，点「换一批」试试</p>
        </div>
      )}

      {fmTracks.length > 0 && (
        <div className="fm-list">
          {fmTracks.map((t, i) => {
            const current = player.current?.id === t.id
            return (
              <div
                key={`${t.id}-${i}`}
                className={`fm-row ${current ? 'current' : ''}`}
                onDoubleClick={() => playFmTrack(t)}
              >
                <span className="fm-col-index">
                  <span className="index-num">{i + 1}</span>
                  <button className="fm-row-play" title="播放" onClick={() => playFmTrack(t)}>
                    <IconPlay size={14} />
                  </button>
                </span>
                <div className="fm-col-title">
                  {t.album?.picUrl ? (
                    <NetImg src={coverUrl(t.album.picUrl, 80)} className="fm-cover" />
                  ) : (
                    <div className="fm-cover empty"><IconMusic size={14} /></div>
                  )}
                  <div className="fm-title-meta">
                    <span className="fm-track-name">{t.name}</span>
                    <span className="fm-track-artists">{t.artists.map((a) => a.name).join(' / ')}</span>
                  </div>
                </div>
                <span className="fm-col-album">{t.album?.name && t.album.name !== t.name ? t.album.name : ''}</span>
                <span className="fm-col-time">{t.duration ? formatTime(t.duration / 1000) : '--:--'}</span>
                <button className="fm-row-play-end" title="播放" onClick={() => playFmTrack(t)}>
                  <IconPlay size={14} />
                </button>
              </div>
            )
          })}
          <button className="fm-more" onClick={() => loadFm(true)} disabled={fmLoading}>
            {fmLoading ? '加载中…' : '加载更多'}
          </button>
        </div>
      )}

      {fmMode && <div className="fm-tip">FM 模式：一首播完会自动切到下一首，列表放完会继续拉新推荐</div>}
    </div>
  )
}
