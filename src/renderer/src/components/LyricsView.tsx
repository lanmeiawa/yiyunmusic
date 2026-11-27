import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import { findActiveIndex, computeWordProgress, isLyricGap } from '../utils/lrc'
import { coverUrl } from '../utils/cover'
import NetImg from './NetImg'
import { IconMusic, IconLyrics, IconComment } from './Icons'
import Visualizer from './Visualizer'

/** 单行歌词：支持逐字扫光（网易云原版卡拉OK效果） */
function LyricText({ text, words, filled, activeWord, wordRatio, plain }: {
  text: string
  words?: { text: string; time: number; end: number }[]
  filled: number
  activeWord: number
  wordRatio: number
  plain?: boolean
}) {
  // 无逐字数据或未激活：整行用渐变填充一次性点亮
  if (!words || !words.length) {
    return (
      <span className="lyric-text" style={{ ['--fill' as any]: `${plain ? 100 : filled * 100}%` }}>
        {text || '♪'}
      </span>
    )
  }
  // 有逐字数据：每个字独立计算填充比例，实现精准逐字扫光
  const total = words.length
  return (
    <span className="lyric-text">
      {words.map((w, i) => {
        let ratio = 0
        if (i < activeWord) ratio = 1
        else if (i === activeWord) ratio = wordRatio
        else if (activeWord === -1 && i / total < filled) ratio = 1
        return (
          <span key={i} className="karaoke-word" style={{ ['--wf' as any]: `${ratio * 100}%` }}>
            {w.text}
          </span>
        )
      })}
    </span>
  )
}

export default function LyricsView() {
  const { player, lyricLines, seek, songUrlLoading, customization, comments, loadComments, postComment, profile, setCustomization, immersive, setImmersive } = useApp()
  const [showComments, setShowComments] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentsLoaded, setCommentsLoaded] = useState(0)
  const [mode, setMode] = useState<'lyrics' | 'visual'>('lyrics')

  // 沉浸全屏时用 Esc 退出（进入按钮在顶栏，全屏后由悬浮按钮/键盘接管）
  useEffect(() => {
    if (!immersive) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setImmersive(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [immersive, setImmersive])

  // 打开评论面板时拉取当前歌曲热门评论
  useEffect(() => {
    if (showComments && player.current?.id && commentsLoaded !== player.current.id) {
      loadComments(player.current.id)
      setCommentsLoaded(player.current.id)
    }
  }, [showComments, player.current?.id, commentsLoaded, loadComments])
  const scrollRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])
  const [active, setActive] = useState(-1)
  const [userScrolling, setUserScrolling] = useState(false)
  const resumeTimer = useRef<any>(null)
  /** 本次进入歌词页后是否已完成首次对齐（避免从顶部一路滚下来） */
  const alignedRef = useRef(false)

  const rawIdx = findActiveIndex(lyricLines, player.currentTime)
  const rawLine = rawIdx >= 0 ? lyricLines[rawIdx] : undefined
  const nextRaw = rawIdx + 1 < lyricLines.length ? lyricLines[rawIdx + 1] : undefined
  // 一句唱完到下一句之间的明显空档 → 当作间奏，暂时取消高亮（普通 LRC 也能识别）
  const inGap = isLyricGap(rawLine, nextRaw, player.currentTime)
  const activeIdx = inGap ? -1 : rawIdx
  const activeLine = activeIdx >= 0 ? lyricLines[activeIdx] : undefined
  const wp = computeWordProgress(activeLine, player.currentTime)

  // 切换歌曲：回到顶部并重新做一次"首次对齐"。必须排在同步高亮之前，
  // 否则刚算好的高亮会被这里的 setActive(-1) 覆盖，要等下一句歌词才恢复。
  useEffect(() => {
    alignedRef.current = false
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setActive(-1)
    setUserScrolling(false)
  }, [player.current?.id])

  // 高亮同步：带上歌曲 id，切歌后即使索引刚好相同也能立刻对上
  useEffect(() => {
    if (activeIdx !== active) setActive(activeIdx)
  }, [activeIdx, player.current?.id])

  /** 把某一行放到容器垂直中线；force 或距离很远时直接跳过去，避免长距离平滑滚动像"卡了两秒" */
  const alignTo = useCallback((idx: number, force?: boolean) => {
    const container = scrollRef.current
    const el = idx >= 0 ? lineRefs.current[idx] : null
    if (!container || !el) return false
    const target = Math.max(0, el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2)
    const far = Math.abs(target - container.scrollTop) > container.clientHeight * 0.8
    container.scrollTo({ top: target, behavior: force || far ? 'auto' : 'smooth' })
    return true
  }, [])

  // 进入歌词页 / 从其他页面返回 / 切歌后歌词到位：立刻对准当前进度，不从顶部慢慢滚过去
  useEffect(() => {
    if (alignedRef.current || !lyricLines.length) return
    // 间奏里 activeIdx 是 -1，但页面仍应停在"刚唱完的那一句"，否则会退回开头，看起来像后半段歌词丢了
    const idx = rawIdx >= 0 ? rawIdx : 0
    if (alignTo(idx, true)) alignedRef.current = true
  }, [lyricLines, rawIdx, alignTo, player.current?.id])

  // 追随播放进度滚动；锚点用 rawIdx，间奏时不会停下不动
  useEffect(() => {
    if (userScrolling || !alignedRef.current) return
    const idx = rawIdx >= 0 ? rawIdx : active
    if (idx < 0) return
    alignTo(idx)
  }, [rawIdx, active, userScrolling, lyricLines.length, alignTo])

  const onWheel = () => {
    setUserScrolling(true)
    if (resumeTimer.current) clearTimeout(resumeTimer.current)
    resumeTimer.current = setTimeout(() => setUserScrolling(false), 2600)
  }

  const jumpTo = (time: number) => {
    seek(time)
    setUserScrolling(false)
  }

  const cover = coverUrl(player.current?.album?.picUrl, 600)
  const title = player.current?.name || '暂无播放歌曲'
  const artist = player.current?.artists?.map((a) => a.name).join(' / ') || '选择一首歌开始聆听'

  return (
    <div className={`lyrics-view mode-${mode}`} style={{ ['--lyrics-fs' as any]: `${customization.lyricsFontSize}px` }}>
      {cover && <div className="lyrics-bg" style={{ backgroundImage: `url(${cover})` }} />}
      <div className="lyrics-bg-tint" />

      {immersive && (
        <button className="immersive-exit" onClick={() => setImmersive(false)} title="退出全屏 (Esc)">
          退出全屏
        </button>
      )}

      <div className="lyrics-topbar">
        <div className="now-info">
          <div className="now-cover">
            {cover ? <NetImg src={cover} /> : <IconMusic size={30} />}
          </div>
          <div className="now-text">
            <div className="now-title">{title}</div>
            <div className="now-artist">{artist}</div>
          </div>
        </div>
        <div className="lyrics-topbar-actions">
          <span className="lyrics-mode-switch">
            <button className={mode === 'lyrics' ? 'sel' : ''} onClick={() => setMode('lyrics')}>动态歌词</button>
            <button className={mode === 'visual' ? 'sel' : ''} onClick={() => setMode('visual')}>音乐可视化</button>
          </span>
          {mode === 'lyrics' && <span className="lyrics-font-ctl" title="歌词字号">
            <button onClick={() => setCustomization({ lyricsFontSize: Math.max(16, customization.lyricsFontSize - 2) })}>A-</button>
            <em>{customization.lyricsFontSize}</em>
            <button onClick={() => setCustomization({ lyricsFontSize: Math.min(40, customization.lyricsFontSize + 2) })}>A+</button>
          </span>}
          <button
            className={`lyrics-badge btn-link ${showComments ? 'active' : ''}`}
            onClick={() => setShowComments((v) => !v)}
            title="查看热门评论"
          >
            <IconComment size={15} /> 评论
          </button>
          <button className="lyrics-badge btn-link" onClick={() => setImmersive(true)} title="沉浸全屏，仅显示歌词内容（Esc 退出）">
            全屏
          </button>
          <div className="lyrics-badge"><IconLyrics size={15} /> 动态歌词</div>
        </div>
      </div>

      {showComments && (
        <div className="comments-panel">
          <div className="comments-title">热门评论 <span className="comments-count">{comments.length}</span></div>
          <div className="comment-input-row">
            <input
              className="comment-input"
              placeholder={profile ? '说说你的感想…' : '登录后可发表评论'}
              maxLength={140}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && commentDraft.trim()) { postComment(player.current?.id!, commentDraft); setCommentDraft('') } }}
            />
            <button
              className="comment-send"
              onClick={() => { if (commentDraft.trim() && player.current) { postComment(player.current.id, commentDraft); setCommentDraft('') } }}
            >发送</button>
          </div>
          <div className="comments-list">
            {comments.length === 0 && <div className="comments-empty">暂无热门评论</div>}
            {comments.map((c) => (
              <div key={c.id} className="comment-row">
                <img className="comment-avatar" src={c.avatar} alt="" />
                <div className="comment-body">
                  <div className="comment-user">{c.user} <span className="comment-time">{c.time}</span></div>
                  <div className="comment-content">{c.content}</div>
                  <div className="comment-likes">♥ {c.likes}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'visual' ? <Visualizer /> : (
      <div
        className={`lyrics-scroll ${userScrolling ? 'user-scrolling' : ''}`}
        ref={scrollRef}
        onWheel={onWheel}
        onTouchMove={onWheel}
      >
        <div className="lyrics-spacer" />
        {lyricLines.length > 0 ? (
          lyricLines.map((line, i) => {
            const isActive = i === active
            const distance = Math.abs(i - active)
            let opacity = 0.28
            if (isActive) opacity = 1
            else if (distance === 1) opacity = 0.5
            else if (distance === 2) opacity = 0.36
            const prog = isActive ? wp : { filled: 0, activeWord: -1, wordRatio: 0 }
            return (
              <div
                key={`${line.time}-${i}`}
                ref={(el) => (lineRefs.current[i] = el)}
                className={`lyric-line ${isActive ? 'active' : ''}`}
                style={{ opacity }}
                onClick={() => jumpTo(line.time)}
                title="点击跳转到此处"
              >
                <div className="lyric-main">
                  <LyricText
                    text={line.text}
                    words={line.words}
                    filled={prog.filled}
                    activeWord={prog.activeWord}
                    wordRatio={prog.wordRatio}
                    plain={!isActive}
                  />
                </div>
                {customization.showTranslation && line.translation && (
                  <div className="lyric-trans">{line.translation}</div>
                )}
              </div>
            )
          })
        ) : (
          <div className="lyrics-placeholder">
            <div className="placeholder-note"><IconMusic size={40} /></div>
            <h3>{songUrlLoading ? '正在加载歌词…' : '暂无歌词'}</h3>
            <p>{player.current ? '这首歌暂时没有匹配到歌词' : '播放一首歌曲，让歌词随旋律流动'}</p>
          </div>
        )}
        <div className="lyrics-spacer" />
      </div>
      )}

      {userScrolling && (
        <div className="scroll-hint">自由浏览中 · 2 秒后回到当前歌词</div>
      )}
    </div>
  )
}
