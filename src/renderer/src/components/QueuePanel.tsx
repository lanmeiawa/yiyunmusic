import { useApp } from '../store'
import { formatTime } from '../utils/lrc'
import { coverUrl } from '../utils/cover'
import NetImg from './NetImg'
import { IconPlay } from './Icons'

/** 播放队列面板：当前播放列表，点击跳转播放 */
export default function QueuePanel({ onClose }: { onClose: () => void }) {
  const { player, playTrack } = useApp()
  const list = player.playlist
  return (
    <div className="queue-panel" onClick={(e) => e.stopPropagation()}>
      <div className="queue-head">
        <b>当前播放</b>
        <span className="queue-count">{list.length} 首</span>
        <button className="queue-close" onClick={onClose}>✕</button>
      </div>
      <div className="queue-list">
        {list.length === 0 && <div className="queue-empty">播放列表为空</div>}
        {list.map((t, i) => {
          const isCurrent = player.current?.id === t.id
          return (
            <div
              key={`${t.id}-${i}`}
              className={`queue-row ${isCurrent ? 'current' : ''}`}
              onDoubleClick={() => playTrack(t, list)}
            >
              <span className="queue-cover">
                <NetImg src={coverUrl(t.album?.picUrl, 60)} />
              </span>
              <span className="queue-name" title={t.name}>{t.name}</span>
              <span className="queue-artist">{t.artists.map((a) => a.name).join('/')}</span>
              <span className="queue-time">{formatTime(t.duration / 1000)}</span>
              <span className="queue-play" onClick={() => playTrack(t, list)}><IconPlay size={12} /></span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
