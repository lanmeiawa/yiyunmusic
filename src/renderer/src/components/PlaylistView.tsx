import React, { useState } from 'react'
import { useApp } from '../store'
import { IconPlay, IconMusic, IconClock, IconVip } from './Icons'
import { formatTime } from '../utils/lrc'
import { coverUrl } from '../utils/cover'
import TrackActions from './TrackActions'
import { IconList } from './Icons'
import NetImg from './NetImg'

export default function PlaylistView() {
  const {
    tracks, playlistName, playlistLoading, player, playTrack, playlists, currentPlaylistId,
    createPlaylist, deletePlaylist, batchDownload, batchLike, batchAddToPlaylist, batchRemoveFromPlaylist
  } = useApp()
  const [newPlName, setNewPlName] = useState('')
  const [showNewPl, setShowNewPl] = useState(false)
  // 批量管理
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [batchPlOpen, setBatchPlOpen] = useState(false)
  const selectedSet = new Set(selectedIds)
  const selectedTracks = tracks.filter((t) => selectedSet.has(t.id))
  const allSelected = tracks.length > 0 && selectedIds.length === tracks.length
  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const exitBatch = () => { setBatchMode(false); setSelectedIds([]); setBatchPlOpen(false) }

  if (playlistLoading) {
    return (
      <div className="playlist-view loading">
        <div className="pl-header-skeleton" />
        <div className="pl-rows">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="pl-row-skeleton" />)}
        </div>
      </div>
    )
  }

  const playAll = () => {
    if (tracks.length) playTrack(tracks[0], tracks)
  }

  return (
    <div className="playlist-view">
      <div className="pl-header">
        <div className="pl-cover">
          {tracks[0]?.album?.picUrl
            ? <NetImg src={coverUrl(tracks[0].album.picUrl, 300)} />
            : <IconMusic size={54} />}
        </div>
        <div className="pl-info">
          <div className="pl-label">歌单</div>
          <h1>{playlistName}</h1>
          <div className="pl-meta">共 {tracks.length} 首歌曲 · 亦云音乐</div>
        </div>
      </div>

      <div className="pl-toolbar">
        <button className="play-all" onClick={playAll}>
          <IconPlay size={17} /> 播放全部
        </button>
        <button className={`pl-refresh ${batchMode ? 'active' : ''}`} onClick={() => (batchMode ? exitBatch() : setBatchMode(true))}>
          {batchMode ? '退出管理' : '批量管理'}
        </button>

        {batchMode ? (
          <>
            <button className="pl-refresh" onClick={() => setSelectedIds(allSelected ? [] : tracks.map((t) => t.id))}>
              {allSelected ? '取消全选' : '全选'}
            </button>
            <span className="pl-batch-count">已选 {selectedIds.length} 首</span>
            <button className="pl-refresh" disabled={!selectedIds.length} onClick={() => batchDownload(selectedTracks)}>批量下载</button>
            <button className="pl-refresh" disabled={!selectedIds.length} onClick={() => batchLike(selectedTracks)}>批量收藏</button>
            <span className="atpl-wrap">
              <button className="pl-refresh" disabled={!selectedIds.length} onClick={() => setBatchPlOpen((v) => !v)}>添加到歌单</button>
              {batchPlOpen && (
                <div className="atpl-menu batch-pl-menu">
                  <div className="atpl-title">添加到歌单</div>
                  <div className="atpl-list">
                    {playlists.slice(0, 12).map((pl) => (
                      <button key={pl.id} onClick={async () => { await batchAddToPlaylist(pl.id, selectedTracks); setBatchPlOpen(false) }}>{pl.name}</button>
                    ))}
                    {playlists.length === 0 && <div className="atpl-empty">暂无歌单</div>}
                  </div>
                  <button className="atpl-close" onClick={() => setBatchPlOpen(false)}>收起</button>
                </div>
              )}
            </span>
            {currentPlaylistId && !playlists.find((p) => p.id === currentPlaylistId)?.specialType && (
              <button className="pl-refresh danger" disabled={!selectedIds.length} onClick={() => {
                if (window.confirm(`确定从当前歌单移除选中的 ${selectedIds.length} 首歌曲？`)) {
                  batchRemoveFromPlaylist(currentPlaylistId, selectedIds).then(() => setSelectedIds([]))
                }
              }}>移出歌单</button>
            )}
          </>
        ) : (
          <>
            <button className="pl-refresh" onClick={() => setShowNewPl((v) => !v)} title="新建歌单">＋ 新建歌单</button>
            {showNewPl && (
              <span className="pl-new-wrap">
                <input
                  className="pl-new-input"
                  value={newPlName}
                  placeholder="歌单名称"
                  maxLength={30}
                  autoFocus
                  onChange={(e) => setNewPlName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newPlName.trim()) { createPlaylist(newPlName); setShowNewPl(false); setNewPlName('') } }}
                />
                <button className="pl-refresh" onClick={() => { if (newPlName.trim()) { createPlaylist(newPlName); setShowNewPl(false); setNewPlName('') } }}>创建</button>
              </span>
            )}
          </>
        )}
        {!batchMode && currentPlaylistId && !playlists.find((p) => p.id === currentPlaylistId)?.specialType && (
          <button className="pl-refresh danger" onClick={() => { if (window.confirm('确定删除该歌单？删除后无法恢复。')) deletePlaylist(currentPlaylistId) }} title="删除该歌单">删除歌单</button>
        )}
        {!batchMode && <span className="pl-toolbar-hint">双击播放 · 心形收藏 · ＋加歌单 · 下载</span>}
      </div>

      <div className="pl-table-head">
        <span className="col-index">#</span>
        <span className="col-title">标题</span>
        <span className="col-album">专辑</span>
        <span className="col-time"><IconClock size={15} /></span>
      </div>

      <div className="pl-rows">
        {tracks.map((t, i) => {
          const isCurrent = player.current?.id === t.id
          return (
            <div
              key={`${t.id}-${i}`}
              className={`pl-row ${isCurrent ? 'current' : ''} ${batchMode ? 'batch' : ''} ${selectedSet.has(t.id) ? 'sel' : ''}`}
              onClick={batchMode ? () => toggleSelect(t.id) : undefined}
              onDoubleClick={() => { if (!batchMode) playTrack(t, tracks) }}
            >
              <span className="col-index">
                {batchMode ? (
                  <span className={`batch-check ${selectedSet.has(t.id) ? 'on' : ''}`} />
                ) : (
                  <>
                    <span className="row-cover" onClick={(e) => { e.stopPropagation(); playTrack(t, tracks) }} title="点击播放">
                      <NetImg src={coverUrl(t.album?.picUrl, 80)} />
                      <span className="row-cover-mask"><IconPlay size={13} /></span>
                    </span>
                    <span className="index-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="row-play" onClick={() => playTrack(t, tracks)}><IconPlay size={14} /></span>
                    <TrackActions track={t} />
                  </>
                )}
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
        {tracks.length === 0 && <div className="pl-empty">这个歌单还没有歌曲</div>}
      </div>
    </div>
  )
}
