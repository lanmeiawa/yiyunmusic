import React, { useEffect } from 'react'
import { useApp } from '../store'
import { IconClock, IconPlay, IconMusic, IconVip } from './Icons'
import { formatTime } from '../utils/lrc'
import { coverUrl } from '../utils/cover'
import TrackActions from './TrackActions'
import NetImg from './NetImg'

export default function HistoryView() {
  const { historyTracks, loadHistory, player, playTrack, playlistLoading } = useApp()

  useEffect(() => { loadHistory() }, [loadHistory])

  const playAll = () => { if (historyTracks.length) playTrack(historyTracks[0], historyTracks) }

  return (
    <div className="playlist-view history-view">
      <div className="pl-header">
        <div className="pl-cover history-cover">
          <IconClock size={54} />
        </div>
        <div className="pl-info">
          <div className="pl-label">记录</div>
          <h1>最近播放</h1>
          <div className="pl-meta">共 {historyTracks.length} 首歌曲 · 保留最近 100 条</div>
        </div>
      </div>

      <div className="pl-toolbar">
        <button className="play-all" onClick={playAll} disabled={!historyTracks.length}>
          <IconPlay size={17} /> 播放全部
        </button>
        <button className="pl-refresh" onClick={() => loadHistory()} title="刷新记录">刷新</button>
        <span className="pl-toolbar-hint">双击歌曲即可播放</span>
      </div>

      {playlistLoading ? (
        <div>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="pl-row-skeleton" />)}</div>
      ) : historyTracks.length > 0 ? (
        <>
          <div className="pl-table-head">
            <span className="col-index">#</span>
            <span className="col-title">标题</span>
            <span className="col-album">专辑</span>
            <span className="col-time"><IconClock size={15} /></span>
          </div>
          <div className="pl-rows">
            {historyTracks.map((t, i) => {
              const isCurrent = player.current?.id === t.id
              return (
                <div
                  key={`${t.id}-${i}`}
                  className={`pl-row ${isCurrent ? 'current' : ''}`}
                  onDoubleClick={() => playTrack(t, historyTracks)}
                >
                  <span className="col-index">
                    <span className="row-cover" onClick={(e) => { e.stopPropagation(); playTrack(t, historyTracks) }} title="点击播放">
                      <NetImg src={coverUrl(t.album?.picUrl, 80)} />
                      <span className="row-cover-mask"><IconPlay size={13} /></span>
                    </span>
                    <span className="index-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="row-play" onClick={() => playTrack(t, historyTracks)}><IconPlay size={14} /></span>
                    <TrackActions track={t} />
                  </span>
                  <span className="col-title">
                    <span className="track-name">{t.name}</span>
                    {t.fee === 1 && <span className="fee-tag"><IconVip size={11} /> VIP</span>}
                    <span className="track-artists">{t.artists.map((a) => a.name).join(' / ')}</span>
                  </span>
                  <span className="col-album">{t.album.name}</span>
                  <span className="col-time">{formatTime(t.duration / 1000)}</span>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="pl-empty">
          <IconMusic size={36} style={{ opacity: 0.4, margin: '0 auto 12px' }} />
          <div>还没有播放记录 · 播放一首歌后会出现在这里</div>
        </div>
      )}
    </div>
  )
}
