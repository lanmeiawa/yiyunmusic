import { useState } from 'react'
import { useApp } from '../store'
import type { Track } from '../types'
import { IconHeart, IconDownload } from './Icons'

/**
 * 歌曲行内操作按钮组：收藏（心形）/ 添加到歌单（弹歌单选择菜单）/ 下载
 * hover 时显示，配合 .pl-row 布局使用
 */
export default function TrackActions({ track }: { track: Track }) {
  const { isLiked, toggleLike, addToPlaylist, playlists, profile, openLogin, createPlaylist, downloadTrack, setMessage } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const liked = isLiked(track.id)

  const handleCreateAndAdd = async () => {
    if (!newName.trim()) return
    const id = await createPlaylist(newName)
    if (id) {
      await addToPlaylist(id, track)
      setMenuOpen(false)
      setCreating(false)
      setNewName('')
    }
  }

  return (
    <span className="row-actions" onClick={(e) => e.stopPropagation()}>
      <button
        className={`ra-btn ${liked ? 'liked' : ''}`}
        title={liked ? '取消收藏' : '收藏到「我喜欢的音乐」'}
        onClick={() => toggleLike(track)}
      >
        <IconHeart size={13} fill={liked ? 'currentColor' : 'none'} />
      </button>

      <span className="atpl-wrap">
        <button
          className="ra-btn"
          title="添加到歌单"
          onClick={() => {
            if (!profile) { openLogin(); setMessage('登录后可把歌曲添加到自己的歌单'); return }
            setMenuOpen((v) => !v)
          }}
        >
          ＋
        </button>
        {menuOpen && (
          <div className="atpl-menu" onClick={(e) => e.stopPropagation()}>
            <div className="atpl-title">添加到歌单</div>
            <div className="atpl-list">
              {playlists.slice(0, 12).map((pl) => (
                <button key={pl.id} title={pl.name} onClick={() => { addToPlaylist(pl.id, track); setMenuOpen(false) }}>
                  {pl.name}
                </button>
              ))}
              {playlists.length === 0 && <div className="atpl-empty">暂无歌单，先新建一个吧</div>}
            </div>
            {creating ? (
              <div className="atpl-new">
                <input
                  value={newName}
                  placeholder="输入歌单名称"
                  maxLength={30}
                  autoFocus
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateAndAdd() }}
                />
                <button onClick={handleCreateAndAdd}>创建</button>
              </div>
            ) : (
              <button className="atpl-create" onClick={() => setCreating(true)}>＋ 新建歌单</button>
            )}
            <button className="atpl-close" onClick={() => setMenuOpen(false)}>收起</button>
          </div>
        )}
      </span>

      <button className="ra-btn" title="下载歌曲" onClick={() => downloadTrack(track)}>
        <IconDownload size={13} />
      </button>
    </span>
  )
}
