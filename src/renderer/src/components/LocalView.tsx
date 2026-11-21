import React from 'react'
import { useApp } from '../store'
import { formatTime } from '../utils/lrc'
import { IconPlay, IconMusic } from './Icons'

/** 本地音乐：扫描目录后播放本地音频文件 */
export default function LocalView() {
  const { localTracks, localLoading, scanLocal, openLocalFiles, player, playTrack } = useApp()

  return (
    <div className="radio-view local-view">
      <div className="radio-header">
        <div className="radio-hero">
          <span className="radio-logo">🎵</span>
          <div>
            <h1>本地音乐</h1>
            <p>{localTracks.length ? `已扫描 ${localTracks.length} 首本地歌曲` : '扫描本机目录，直接播放本地音频文件'}</p>
          </div>
        </div>
        <div className="local-actions">
          <button className="pl-refresh" onClick={scanLocal}>{localLoading ? '扫描中…' : '扫描目录'}</button>
          <button className="pl-refresh" onClick={openLocalFiles}>打开文件</button>
        </div>
      </div>

      <div className="pl-table-head">
        <span className="col-index">#</span>
        <span className="col-title">标题</span>
        <span className="col-album">歌手</span>
        <span className="col-time" />
      </div>

      <div className="pl-rows">
        {localLoading && Array.from({ length: 6 }).map((_, i) => <div key={i} className="sk-row" />)}
        {!localLoading && localTracks.length === 0 && (
          <div className="radio-empty">
            <IconMusic size={30} />
            <p>点击「扫描目录」选择音乐文件夹，或「打开文件」直接播放单个音频；支持 mp3 / flac / wav / m4a / ape / ogg，并自动识别同目录下的 .lrc 歌词与封面图</p>
          </div>
        )}
        {!localLoading && localTracks.map((t, i) => {
          const isCurrent = player.current?.id === t.id
          return (
            <div
              key={`${t.localPath}-${i}`}
              className={`pl-row ${isCurrent ? 'current' : ''}`}
              onDoubleClick={() => playTrack(t, localTracks)}
            >
              <span className="col-index">
                <span className="index-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="row-play" onClick={() => playTrack(t, localTracks)}><IconPlay size={14} /></span>
              </span>
              <span className="col-title"><span className="track-name" title={t.name}>{t.name}</span></span>
              <span className="col-album">{t.artists[0]?.name}</span>
              <span className="col-time">{t.duration ? formatTime(t.duration / 1000) : ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
