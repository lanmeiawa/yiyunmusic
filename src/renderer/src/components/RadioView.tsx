import React, { useEffect } from 'react'
import { useApp } from '../store'
import { formatTime } from '../utils/lrc'
import { coverUrl } from '../utils/cover'
import NetImg from './NetImg'
import { IconPlay, IconClock, IconMusic } from './Icons'
import TrackActions from './TrackActions'

/** 听书电台：两级结构——热门电台网格（稳定接口）→ 电台节目列表 */
export default function RadioView() {
  const {
    radioPrograms, radioLoading, loadRadio,
    radios, radiosLoading, loadRadios, loadRadioPrograms, activeRadio, setActiveRadio,
    radioCats, activeCat, setActiveCat, loadRadioCats,
    aggCats,
    player, playTrack
  } = useApp()

  useEffect(() => { if (!radios.length) loadRadios() }, [radios.length, loadRadios])
  useEffect(() => { if (!radioCats.length) loadRadioCats() }, [radioCats.length, loadRadioCats])
  useEffect(() => { if (activeRadio) loadRadioPrograms(activeRadio.id) }, [activeRadio?.id])

  // 分类 tabs：聚合数据的全部分类（前端本地过滤，切换零请求）
  const CAT_TABS: { id: number; name: string }[] = [
    { id: -1, name: '推荐' },
    ...aggCats.map((name, idx) => ({ id: idx, name }))
  ]
  const shownRadios = activeCat === -1 ? radios : radios.filter((r) => r.category === CAT_TABS.find((t) => t.id === activeCat)?.name)

  return (
    <div className="radio-view">
      <div className="radio-header">
        <div className="radio-hero">
          <span className="radio-logo">📻</span>
          <div>
            <h1>{activeRadio ? activeRadio.name : '听书电台'}</h1>
            <p>{activeRadio ? `${activeRadio.programCount} 个节目 · 点击播放` : '热门电台 · 音乐故事 · 脱口秀 · 有声书'}</p>
          </div>
        </div>
        <div className="radio-header-actions">
          {activeRadio && (
            <button className="pl-refresh" onClick={() => setActiveRadio(null)}>← 全部电台</button>
          )}
          <button className="pl-refresh" onClick={() => activeRadio ? loadRadioPrograms(activeRadio.id) : loadRadios()}>刷新</button>
        </div>
      </div>

      {/* 一级：电台网格 */}
      {!activeRadio && (
        <>
        <div className="radio-tabs">
          {CAT_TABS.map((t) => (
            <button key={t.name} className={`radio-tab ${activeCat === t.id ? 'sel' : ''}`} onClick={() => setActiveCat(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
        <div className="radio-grid">
          {radiosLoading && Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="album-card skeleton-card">
              <div className="album-cover" />
              <div className="album-name" />
            </div>
          ))}
          {!radiosLoading && shownRadios.map((r) => (
            <button key={r.id} className="album-card" onClick={() => setActiveRadio(r)}>
              <div className="album-cover">
                <NetImg src={coverUrl(r.picUrl, 300)} alt={r.name} />
                <span className="album-play"><IconPlay size={18} /></span>
              </div>
              <div className="album-name" title={r.name}>{r.name}</div>
              <div className="album-artist">{r.programCount} 个节目{r.category ? ` · ${r.category}` : ''}</div>
            </button>
          ))}
          {!radiosLoading && shownRadios.length === 0 && (
            <div className="radio-empty"><IconMusic size={30} /> {radiosLoading ? '' : '电台加载失败，点击右上角刷新重试'}</div>
          )}
        </div>
        </>
      )}

      {/* 二级：电台节目列表 */}
      {activeRadio && (
        <>
          <div className="pl-table-head">
            <span className="col-index">#</span>
            <span className="col-title">节目</span>
            <span className="col-album">时长</span>
            <span className="col-time"><IconClock size={15} /></span>
          </div>
          <div className="pl-rows">
            {radioLoading && Array.from({ length: 8 }).map((_, i) => (
              <div key={`sk-${i}`} className="sk-row"><span className="col-index" /><span className="col-title" /></div>
            ))}
            {!radioLoading && radioPrograms.length === 0 && (
              <div className="radio-empty"><IconMusic size={30} /> 节目暂时拉取不到（接口限频），稍后点击刷新重试</div>
            )}
            {!radioLoading && radioPrograms.map((t, i) => {
              const isCurrent = player.current?.id === t.id
              return (
                <div
                  key={`${t.id}-${i}`}
                  className={`pl-row ${isCurrent ? 'current' : ''}`}
                  onDoubleClick={() => playTrack(t, radioPrograms)}
                >
                  <span className="col-index">
                    <span className="row-cover" onClick={(e) => { e.stopPropagation(); playTrack(t, radioPrograms) }} title="点击播放">
                      <NetImg src={coverUrl(t.album?.picUrl, 80)} />
                      <span className="row-cover-mask"><IconPlay size={13} /></span>
                    </span>
                    <span className="index-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="row-play" onClick={() => playTrack(t, radioPrograms)}><IconPlay size={14} /></span>
                    <TrackActions track={t} />
                  </span>
                  <span className="col-title">
                    <span className="track-name" title={t.name}>{t.name}</span>
                  </span>
                  <span className="col-album">{formatTime(t.duration / 1000)}</span>
                  <span className="col-time" />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
