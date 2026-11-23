import React, { useState } from 'react'
import { useApp } from '../store'
import { QUALITY_OPTIONS } from '../types'
import { qualityLabel } from '../i18n'
import {
  IconPlay, IconPause, IconPrev, IconNext, IconVolume,
  IconLoop, IconShuffle, IconSingle, IconLyrics, IconMusic, IconVip
} from './Icons'
import { formatTime } from '../utils/lrc'
import { coverUrl } from '../utils/cover'
import NetImg from './NetImg'
import { IconMonitor } from './IconsExtra'
import { IconRate, IconHeart, IconDownload, IconQueue, IconFM } from './Icons'
import QueuePanel from './QueuePanel'

export default function PlayerBar() {
  const {
    player, togglePlay, nextTrack, prevTrack, seek, setVolume, setPlayMode, view, setView,
    quality, setQuality, currentQuality, currentQualityInfo, isLoggedIn, openLogin, setMessage, profile, t, locale,
    desktopLyrics, toggleDesktopLyrics, customization, setCustomization,
    toggleLike, isLiked, downloadTrack, fmMode, fmNext
  } = useApp()
  const [queueOpen, setQueueOpen] = useState(false)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [rateOpen, setRateOpen] = useState(false)

  const { current, isPlaying, duration, currentTime, volume, playMode } = player
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const profileVip = profile?.vipType || 0

  const activeQuality = QUALITY_OPTIONS.find((q) => q.level === quality) || QUALITY_OPTIONS[2]
  // 缩略标签跟随「当前实际播放档位」currentQuality：
  // 切换音质时 setQuality 会立即更新它，所以标签马上显示刚选的档位，不再停在旧值；
  // 接口若把「无损」降级为「极高」，resolveAndPlay 成功后会用真实 level 再修正。
  const qName = (level: string) => qualityLabel(locale, level)
  const actualQuality = QUALITY_OPTIONS.find((q) => q.level === (currentQualityInfo?.level || '').toLowerCase())
  const tagLabel = current
    ? (currentQuality === '本地' ? '本地' : qName((currentQuality || quality).toLowerCase()))
    : qName(quality)
  const actualDesc = currentQualityInfo
    ? [
        actualQuality?.label || actualLevel,
        currentQualityInfo.br ? `${Math.round(currentQualityInfo.br / 1000)}kbps` : '',
        (currentQualityInfo.type || '').toUpperCase()
      ].filter(Boolean).join(' · ')
    : ''

  const pickQuality = (level: string, vip: boolean) => {
    setQualityOpen(false)
    if (!isLoggedIn) {
      openLogin()
      setMessage('登录网易云账号后即可选择音质')
      return
    }
    if (vip && profileVip < 1) {
      setMessage('无损及以上音质需要网易云会员，请先开通')
      return
    }
    setQuality(level)
    setMessage(`音质已切换为「${qName(level)}」，正在重新加载音源`)
  }

  const modeIcon = playMode === 'loop' ? <IconLoop size={18} />
    : playMode === 'single' ? <IconSingle size={18} />
    : <IconShuffle size={18} />
  const nextMode = () => {
    const order: Array<typeof playMode> = ['loop', 'single', 'shuffle']
    setPlayMode(order[(order.indexOf(playMode) + 1) % order.length])
  }

  const modeLabel = playMode === 'loop' ? '列表循环' : playMode === 'single' ? '单曲循环' : '随机播放'

  return (
    <div className="playerbar">
      {/* 左：歌曲信息 */}
      <div className="pb-song">
        <button
          className={`pb-cover ${current?.album?.picUrl ? '' : 'empty'}`}
          onClick={() => setView(current ? 'lyrics' : 'discover')}
          title={current ? '打开歌词页' : '去发现音乐'}
        >
          {current?.album?.picUrl ? <NetImg src={coverUrl(current.album.picUrl, 100)} /> : <IconMusic size={20} />}
        </button>
        <div className="pb-song-meta">
          <div className="pb-song-name">
            <span className="pb-song-title" title={current?.name || ''}>{current?.name || '尚未播放'}</span>
            {current?.fee === 1 && <span className="pb-vip"><IconVip size={10} /> VIP</span>}
          </div>
          <div className="pb-song-artist">{current?.artists?.map((a) => a.name).join(' / ') || 'yiyunmusic'}</div>
        </div>
        <button
          className={`pb-lyric-btn ${view === 'lyrics' ? 'active' : ''}`}
          onClick={() => setView(view === 'lyrics' ? (current ? 'playlist' : 'discover') : 'lyrics')}
          title={t('player.lyrics')}
        >
          <IconLyrics size={18} />
        </button>
      </div>

      {/* 中：控制 + 进度 */}
      <div className="pb-center">
        <div className="pb-controls">
          <button onClick={nextMode} title={modeLabel} className="pb-mode">{modeIcon}</button>
          <button onClick={prevTrack} title={t('player.prev')}><IconPrev size={20} /></button>
          <button className="pb-play" onClick={togglePlay} title={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? <IconPause size={20} /> : <IconPlay size={20} />}
          </button>
          <button onClick={nextTrack} title={t('player.next')}><IconNext size={20} /></button>
          <button className="pb-mode" title={t('player.queue')}><IconMusic size={17} /></button>
        </div>
        <div className="pb-progress">
          <span className="pb-time">{formatTime(currentTime)}</span>
          <div className="pb-slider-wrap">
            <input
              type="range"
              className="pb-slider"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => seek(Number(e.target.value))}
              style={{ ['--p' as any]: `${progress}%` }}
            />
          </div>
          <span className="pb-time">{formatTime(duration)}</span>
        </div>
      </div>

      {/* 右：队列 + FM + 桌面歌词 + 收藏 + 下载 + 倍速 + 音质 + 音量 */}
      <div className="pb-right">
        <span className="queue-wrap">
          <button
            className={`pb-lyric-btn ${queueOpen ? 'active' : ''}`}
            onClick={() => setQueueOpen((v) => !v)}
            title={t('player.queue')}
          >
            <IconQueue size={17} />
          </button>
          {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
        </span>
        <button
          className={`pb-lyric-btn ${fmMode ? 'active' : ''}`}
          onClick={() => (fmMode ? (setMessage('已退出私人FM'), undefined) : fmNext())}
          title={fmMode ? '私人FM播放中（点击退出）' : '私人FM（随机推荐）'}
        >
          <IconFM size={17} />
        </button>
        <button
          className={`pb-lyric-btn ${current && isLiked(current.id) ? 'liked' : ''}`}
          onClick={() => current && toggleLike(current)}
          disabled={!current}
          title={current && isLiked(current.id) ? '取消收藏' : '收藏当前歌曲'}
        >
          <IconHeart size={16} fill={current && isLiked(current.id) ? 'currentColor' : 'none'} />
        </button>
        <button
          className="pb-lyric-btn"
          onClick={() => current && downloadTrack(current)}
          disabled={!current}
          title={t('download.start')}
        >
          <IconDownload size={16} />
        </button>
        <button
          className={`pb-lyric-btn ${desktopLyrics.enabled ? 'active' : ''}`}
          onClick={toggleDesktopLyrics}
          title={desktopLyrics.enabled ? '关闭桌面歌词' : '开启桌面悬浮歌词'}
        >
          <IconMonitor size={17} />
        </button>
        <div className="quality-switcher rate-switcher">
          <button
            className={`quality-btn ${rateOpen ? 'open' : ''}`}
            onClick={() => setRateOpen((v) => !v)}
            title={t('player.rate')}
          >
            <IconRate size={17} />
          </button>
          {rateOpen && (
            <div className="quality-menu rate-menu">
              <div className="quality-menu-title">{t('player.rate')}</div>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                <button
                  key={r}
                  className={`quality-option ${customization.playbackRate === r ? 'active' : ''}`}
                  onClick={() => { setCustomization({ playbackRate: r }); setRateOpen(false) }}
                >
                  <span className="quality-option-label">{r}x</span>
                  {customization.playbackRate === r && <span className="quality-check">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="quality-switcher">
          <button
            className={`quality-btn ${qualityOpen ? 'open' : ''}`}
            onClick={() => { setQualityOpen((v) => !v); setRateOpen(false) }}
            title={`播放音质${actualDesc ? ` · 当前 ${actualDesc}` : ''}`}
          >
            <span className="quality-tag">{current ? tagLabel : t('player.quality')}</span>
          </button>
          {qualityOpen && (
            <div className="quality-menu">
              <div className="quality-menu-title">
                {t('player.quality')} {actualDesc && <span>{actualDesc}</span>}
              </div>
              {QUALITY_OPTIONS.map((q) => (
                <button
                  key={q.level}
                  className={`quality-option ${quality === q.level ? 'active' : ''}`}
                  onClick={() => pickQuality(q.level, q.vip)}
                >
                  <span className="quality-option-label">
                    {qName(q.level)}
                    {q.vip && <em className="quality-vip">VIP</em>}
                  </span>
                  <span className="quality-option-sub">{q.sub}</span>
                  {quality === q.level && <span className="quality-check">✓</span>}
                </button>
              ))}
              {!isLoggedIn && <div className="quality-hint">登录账号后可选择会员音质</div>}
              <div className="quality-hint">音质由接口实时返回，会员歌曲可能自动降级</div>
            </div>
          )}
        </div>
        <IconVolume size={18} />
        <div className="pb-volume-wrap">
          <input
            type="range"
            className="pb-slider volume"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ ['--p' as any]: `${volume * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
