import React, { useState } from 'react'
import { useApp } from '../store'
import { IconPlay, IconVip, IconSearch } from './Icons'
import { formatTime } from '../utils/lrc'
import { coverUrl } from '../utils/cover'
import TrackActions from './TrackActions'
import NetImg from './NetImg'

type Category = 'all' | 'songs' | 'playlists' | 'albums' | 'artists' | 'shows' | 'lyrics'

export default function SearchView() {
  const { searchKeyword, searchResults, searchError, searching, playTrack, openPlaylist, openArtist, openAlbum, doSearch } = useApp()
  const { songs, playlists, shows, albums, artists, lyricHits } = searchResults
  const [cat, setCat] = useState<Category>('all')

  const tabs: { id: Category; label: string; count: number }[] = [
    { id: 'all', label: '全部', count: songs.length + playlists.length + (shows?.length || 0) + (albums?.length || 0) + (artists?.length || 0) + (lyricHits?.length || 0) },
    { id: 'songs', label: '单曲', count: songs.length },
    { id: 'playlists', label: '歌单', count: playlists.length },
    { id: 'albums', label: '专辑', count: albums?.length || 0 },
    { id: 'artists', label: '歌手', count: artists?.length || 0 },
    { id: 'shows', label: '听书', count: shows?.length || 0 },
    { id: 'lyrics', label: '歌词', count: lyricHits?.length || 0 }
  ]
  const show = (id: Category) => cat === 'all' || cat === id
  const hasAny = tabs.some((t) => t.id !== 'all' && t.count > 0)

  const playLyricHit = (hit: { id: number; name: string; artists: string }) => {
    const found = songs.find((s) => s.id === hit.id)
    if (found) { playTrack(found, songs); return }
    playTrack({
      id: hit.id, name: hit.name,
      artists: hit.artists ? hit.artists.split(' / ').map((n) => ({ id: 0, name: n.trim() })) : [{ id: 0, name: '未知歌手' }],
      album: { id: 0, name: '', picUrl: '' }, duration: 0
    })
  }

  return (
    <div className="search-view">
      <div className="search-head">
        <div className="search-head-icon"><IconSearch size={24} /></div>
        <div>
          <h1>搜索「{searchKeyword}」</h1>
          <p>{searching ? '正在搜索…' : `找到 ${tabs[0].count} 条相关内容`}</p>
        </div>
      </div>

      {!searching && hasAny && (
        <div className="search-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`search-tab ${cat === t.id ? 'sel' : ''}`}
              onClick={() => setCat(t.id)}
            >{t.label}<em>{t.count}</em></button>
          ))}
        </div>
      )}

      {searching ? (
        <div className="search-loading">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="pl-row-skeleton" />)}
        </div>
      ) : !hasAny ? (
        <div className="search-empty">
          <IconSearch size={44} />
          <h3>{searchError ? '搜索遇到问题' : '没有找到相关内容'}</h3>
          <p>{searchError || '换个关键词试试吧'}</p>
          <button className="search-retry" onClick={() => doSearch(searchKeyword)}>重新搜索</button>
        </div>
      ) : (
        <>
          {show('playlists') && playlists.length > 0 && (
            <section className="search-section">
              <h2>歌单</h2>
              <div className="album-grid">
                {playlists.slice(0, cat === 'playlists' ? 30 : 6).map((pl) => (
                  <button key={pl.id} className="album-card" onClick={() => openPlaylist(pl.id)}>
                    <div className="album-cover">
                      <NetImg src={coverUrl(pl.coverImgUrl, 300)} alt={pl.name} />
                      <span className="album-play"><IconPlay size={18} /></span>
                    </div>
                    <div className="album-name" title={pl.name}>{pl.name}</div>
                    <div className="album-artist">{pl.trackCount} 首 · {pl.creator?.nickname || '网易云音乐'}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {show('shows') && !!shows?.length && (
            <section className="search-section">
              <h2>听书节目</h2>
              <div className="album-grid">
                {shows.slice(0, cat === 'shows' ? 30 : 8).map((t, i) => (
                  <button key={`${t.id}-${i}`} className="album-card" onClick={(e) => { e.stopPropagation(); playTrack(t, shows) }}>
                    <div className="album-cover">
                      <NetImg src={coverUrl(t.album?.picUrl, 300)} alt={t.name} />
                      <span className="album-play"><IconPlay size={18} /></span>
                    </div>
                    <div className="album-name" title={t.name}>{t.name}</div>
                    <div className="album-artist">{t.artists[0]?.name || '电台'}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {show('lyrics') && !!lyricHits?.length && (
            <section className="search-section">
              <h2>歌词</h2>
              <div className="lyric-hit-grid">
                {lyricHits.map((hit) => (
                  <button key={hit.id} className="lyric-hit-card" onClick={() => playLyricHit(hit)} title="点击播放这首歌">
                    <div className="lyric-hit-title">{hit.name} <span>{hit.artists}</span></div>
                    <div className="lyric-hit-text">「{hit.snippet || '这首歌暂无歌词片段'}」</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {show('artists') && !!artists?.length && (
            <section className="search-section">
              <h2>歌手</h2>
              <div className="album-grid">
                {artists.slice(0, cat === 'artists' ? 30 : 6).map((a: any) => (
                  <button key={a.id} className="album-card" onClick={() => openArtist(a.id, a.name)}>
                    <div className="album-cover round">
                      <NetImg src={a.picUrl} alt={a.name} />
                      <span className="album-play"><IconPlay size={18} /></span>
                    </div>
                    <div className="album-name" title={a.name}>{a.name}</div>
                    <div className="album-artist">歌手 · {a.albumSize} 张专辑</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {show('albums') && !!albums?.length && (
            <section className="search-section">
              <h2>专辑</h2>
              <div className="album-grid">
                {albums.slice(0, cat === 'albums' ? 30 : 6).map((al: any) => (
                  <button key={al.id} className="album-card" onClick={() => openAlbum(al.id, al.name)}>
                    <div className="album-cover">
                      <NetImg src={al.coverImgUrl} alt={al.name} />
                      <span className="album-play"><IconPlay size={18} /></span>
                    </div>
                    <div className="album-name" title={al.name}>{al.name}</div>
                    <div className="album-artist">{al.artist}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {show('songs') && songs.length > 0 && (
            <section className="search-section">
              <h2>单曲</h2>
              <div className="pl-table-head">
                <span className="col-index">#</span>
                <span className="col-title">标题</span>
                <span className="col-album">专辑</span>
                <span className="col-time"><span /></span>
              </div>
              <div className="pl-rows">
                {songs.map((t, i) => (
                  <div key={`${t.id}-${i}`} className="pl-row" onDoubleClick={() => playTrack(t, songs)}>
                    <span className="col-index">
                      <span className="row-cover" onClick={(e) => { e.stopPropagation(); playTrack(t, songs) }} title="点击播放">
                        <NetImg src={coverUrl(t.album?.picUrl, 80)} />
                        <span className="row-cover-mask"><IconPlay size={13} /></span>
                      </span>
                      <span className="index-num">{String(i + 1).padStart(2, '0')}</span>
                      <span className="row-play" onClick={() => playTrack(t, songs)}><IconPlay size={14} /></span>
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
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
