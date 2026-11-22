import React, { useState } from 'react'
import { useApp } from '../store'
import { IconPlay, IconMusic } from './Icons'
import NetImg from './NetImg'

/**
 * 在线收音机：Radio Browser 全球网络电台
 * - 搜索 / 热门 / 按国家 / 按风格 四种浏览模式
 * - 点击电台直接用本地代理播放（无 CORS 问题）
 * - 实时转文字：像歌词一样滚动显示（需先下载本地语音模型）
 */
export default function OnlineRadioView() {
  const {
    t,
    radioStations, netRadioLoading, radioQuery, setRadioQuery, loadRadioStations,
    radioCountries, radioTags, currentStation, playRadioStation, stopRadio,
    transcripts, transcriptActive, setTranscriptActive
  } = useApp()
  const [keywordInput, setKeywordInput] = useState(radioQuery.keyword)

  const modes = [
    { id: 'top', label: t('radio.top') },
    { id: 'country', label: t('radio.byCountry') },
    { id: 'tag', label: t('radio.byTag') },
    { id: 'search', label: t('radio.search') }
  ]

  const submitSearch = () => {
    setRadioQuery({ mode: 'search', keyword: keywordInput.trim() })
  }

  return (
    <div className="online-radio-view">
      <div className="radio-header">
        <div className="radio-hero">
          <span className="radio-logo">📻</span>
          <div>
            <h1>{t('nav.onlineRadio')}</h1>
            <p>全球网络电台 · 按国家 / 风格收听 · 实时转文字</p>
          </div>
        </div>
        <div className="radio-header-actions">
          <button className="pl-refresh" onClick={loadRadioStations}>刷新</button>
        </div>
      </div>

      {/* 浏览模式切换 */}
      <div className="or-tabs">
        {modes.map((m) => (
          <button
            key={m.id}
            className={`or-tab ${radioQuery.mode === m.id ? 'active' : ''}`}
            onClick={() => setRadioQuery({ mode: m.id })}
          >{m.label}</button>
        ))}
      </div>

      {/* 条件区 */}
      <div className="or-filters">
        {radioQuery.mode === 'search' && (
          <div className="or-search">
            <input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
              placeholder={t('radio.searchPlaceholder')}
            />
            <button onClick={submitSearch}>{t('radio.search')}</button>
          </div>
        )}
        {radioQuery.mode === 'country' && (
          <div className="or-chips">
            {(radioCountries.length ? radioCountries : ['中国', '美国', '英国', '日本', '法国', '德国']).slice(0, 40).map((c) => (
              <button key={c} className={`or-chip ${radioQuery.countryCode === c ? 'active' : ''}`}
                onClick={() => setRadioQuery({ countryCode: c })}>{c}</button>
            ))}
          </div>
        )}
        {radioQuery.mode === 'tag' && (
          <div className="or-chips">
            {(radioTags.length ? radioTags : ['jazz', 'rock', 'pop', 'classical', 'news', 'hip hop']).slice(0, 40).map((tag) => (
              <button key={tag} className={`or-chip ${radioQuery.tag === tag ? 'active' : ''}`}
                onClick={() => setRadioQuery({ tag })}>{tag}</button>
            ))}
          </div>
        )}
      </div>

      {/* 正在收听 + 实时转写 */}
      {currentStation && (
        <div className="or-now-playing">
          <div className="or-np-head">
            {currentStation.favicon ? <NetImg src={currentStation.favicon} className="or-np-cover" /> : <div className="or-np-cover empty"><IconMusic size={24} /></div>}
            <div className="or-np-meta">
              <span className="or-np-label">{t('radio.playing')}</span>
              <h3>{currentStation.name}</h3>
              <p>{currentStation.country || '—'} · {currentStation.codec || '—'} {currentStation.bitrate ? `${currentStation.bitrate}kbps` : ''}</p>
            </div>
            <div className="or-np-actions">
              <button
                className={`or-transcript-btn ${transcriptActive ? 'active' : ''}`}
                onClick={() => setTranscriptActive(!transcriptActive)}
                title={t('radio.transcript')}
              >{transcriptActive ? '转写中 ●' : t('radio.transcript')}</button>
              <button className="or-stop-btn" onClick={stopRadio}>停止</button>
            </div>
          </div>
          {transcriptActive && (
            <div className="or-transcript">
              {transcripts.length === 0 ? (
                <p className="or-transcript-empty">等待语音内容…（需先在设置中下载语音模型）</p>
              ) : (
                transcripts.map((line) => (
                  <p key={line.id} className="or-transcript-line">{line.text}</p>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* 电台列表 */}
      {netRadioLoading ? (
        <div className="or-loading">正在加载全球电台…</div>
      ) : radioStations.length === 0 ? (
        <div className="or-empty">{t('radio.noStations')}</div>
      ) : (
        <div className="or-grid">
          {radioStations.map((s) => {
            const active = currentStation?.stationuuid === s.stationuuid
            return (
              <button
                key={s.stationuuid || s.name}
                className={`or-card ${active ? 'active' : ''}`}
                onClick={() => playRadioStation(s)}
                title={`${s.name} · ${s.country} · ${s.tags.join(', ')}`}
              >
                <div className="or-card-cover">
                  {s.favicon ? <NetImg src={s.favicon} /> : <IconMusic size={22} />}
                  <span className="or-card-play"><IconPlay size={14} /></span>
                </div>
                <div className="or-card-name">{s.name}</div>
                <div className="or-card-sub">
                  {s.country || '—'} · {s.codec || '—'}{s.bitrate ? ` ${s.bitrate}k` : ''}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
