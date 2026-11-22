import React, { useEffect, useState } from 'react'
import { useApp } from '../store'
import { IconPlay, IconVip, IconSearch } from './Icons'
import { formatTime } from '../utils/lrc'
import { coverUrl } from '../utils/cover'
import TrackActions from './TrackActions'
import NetImg from './NetImg'

type Category = 'all' | 'songs' | 'playlists' | 'albums' | 'artists'

export default function SearchView() {
  const { searchKeyword, searchResults, searchError, searching, searchExtraLoading, loadSearchSection, playTrack, openPlaylist, openArtist, openAlbum, doSearch, t } = useApp()
  const { songs, playlists, albums, artists } = searchResults
  const [cat, setCat] = useState<Category>('all')

  // 专辑 / 听书 / 歌词：点开对应分类时再请求，减少搜索瞬间的并发
  useEffect(() => {
    if (cat === 'albums') loadSearchSection('albums')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, searchKeyword])

  const tabs: { id: Category; label: string; count: number }[] = [
    { id: 'all', label: '全部', count: songs.length + playlists.length + (albums?.length || 0) + (artists?.length || 0) },
    { id: 'songs', label: '单曲', count: songs.length },
    { id: 'playlists', label: '歌单', count: playlists.length },
    { id: 'albums', label: '专辑', count: albums?.length || 0 },
    { id: 'artists', label: '歌手', count: artists?.length || 0 }
  ]
  const show = (id: Category) => cat === 'all' || cat === id
  const hasAny = tabs.some((t) => t.id !== 'all' && t.count > 0)

  return (
    <div className="search-view">
      <div className="search-head">
        <div className="search-head-icon"><IconSearch size={24} /></div>
        <div>
          <h1>{t('search.title', { keyword: searchKeyword })}</h1>
          <p>{searching ? t('search.searching') : t('search.results', { count: tabs[0].count })}</p>
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
          <h3>{searchError ? t('search.error') : t('search.empty')}</h3>
          <p>{searchError || t('search.emptyHint')}</p>
          <button className="search-retry" onClick={() => doSearch(searchKeyword)}>{t('search.retry')}</button>
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
