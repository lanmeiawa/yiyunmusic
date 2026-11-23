import React, { useEffect, useRef, useState } from 'react'
import { coverUrl } from '../utils/cover'

interface WordToken { text: string; time: number; end: number }
interface LyricItem { text: string; translation?: string; words?: WordToken[] }
interface Payload {
  lines: LyricItem[]
  active: number
  wordFilled: number
  wordActive: number
  wordRatio: number
  lineTime: number
  lineEnd: number
  playTime: number
  title: string
  artist: string
  cover: string
  isPlaying: boolean
  progress: number
  showTranslation?: boolean
}

const COLORS = ['#ff9db4', '#ffd08a', '#a78bfa', '#7dd3fc', '#86efac', '#ffffff']

/** 窗口尺寸预设：从单行到六行，点击 ⤢ 循环切换 */
const WINDOW_SIZES = [
  { w: 420, h: 96, label: '单行' },
  { w: 520, h: 156, label: '两行' },
  { w: 640, h: 224, label: '三行' },
  { w: 760, h: 304, label: '四行' },
  { w: 880, h: 392, label: '六行' }
]

/** 当前行逐字扫光渲染 */
function ActiveLyric({ line, p }: { line?: LyricItem; p: Payload }) {
  if (!line) return <div className="dl-line active"><span>♪</span></div>
  const words = line.words
  return (
    <div className="dl-line active">
      <span className="dl-lyric-text">
        {words && words.length ? (
          words.map((w, i) => {
            let ratio = 0
            if (i < p.wordActive) ratio = 1
            else if (i === p.wordActive) ratio = p.wordRatio
            else if (p.wordActive === -1 && i / words.length < p.wordFilled) ratio = 1
            return (
              <em key={i} className="dl-word" style={{ ['--wf' as any]: `${ratio * 100}%` }}>{w.text}</em>
            )
          })
        ) : (
          <em className="dl-word" style={{ ['--wf' as any]: `${p.wordFilled * 100}%` }}>{line.text || '♪'}</em>
        )}
      </span>
      {line.translation && p.showTranslation !== false && <i className="dl-trans">{line.translation}</i>}
    </div>
  )
}

export default function DesktopLyrics() {
  const [data, setData] = useState<Payload>({
    lines: [], active: -1, wordFilled: 0, wordActive: -1, wordRatio: 0,
    lineTime: 0, lineEnd: 0, playTime: 0, title: '', artist: '', cover: '', isPlaying: false, progress: 0
  })
  const [locked, setLocked] = useState(false)
  const [fontSize, setFontSize] = useState(28)
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('center')
  const [bgOpacity, setBgOpacity] = useState(0.85)
  const [outline, setOutline] = useState(false)
  const [color, setColor] = useState('#ff9db4')
  const [showBar, setShowBar] = useState(false)
  const [showColors, setShowColors] = useState(false)
  // 自适应行数：按窗口高度与字号计算，最小 1 行，最多 6 行
  const [rows, setRows] = useState(1)
  const [sizeIdx, setSizeIdx] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const calc = () => {
      const h = el.clientHeight
      const lineH = Math.max(18, fontSize * 1.35)
      const n = Math.floor((h - 24) / lineH)
      setRows(Math.max(1, Math.min(6, n)))
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fontSize])

  // 初始尺寸档位与当前窗口高度对齐
  useEffect(() => {
    const h = window.innerHeight
    let best = 0
    let min = Infinity
    WINDOW_SIZES.forEach((s, i) => {
      const d = Math.abs(s.h - h)
      if (d < min) { min = d; best = i }
    })
    setSizeIdx(best)
  }, [])

  useEffect(() => {
    window.eApi.lyrics.request().catch(() => {})
    const off = window.eApi.lyrics.onUpdate((p: Payload) => setData(p))
    // 同步主题到本窗口（独立窗口不共享主界面 data-theme）
    const applyTheme = (t?: string) => { if (t) document.documentElement.setAttribute('data-theme', t) }
    window.eApi.lyrics.getSettings().then((s: any) => {
      if (s) {
        setLocked(!!s.locked)
        setFontSize(s.fontSize || 28)
        if (s.color) setColor(s.color)
        setAlign((s.align as any) || 'center')
        setBgOpacity(typeof s.bgOpacity === 'number' ? s.bgOpacity : 0.85)
        setOutline(!!s.outline)
        applyTheme(s.theme)
      }
    }).catch(() => {})
    const offS = window.eApi.lyrics.onSettings((s: any) => {
      if (s) {
        setLocked(!!s.locked)
        setFontSize(s.fontSize || 28)
        if (s.color) setColor(s.color)
        setAlign((s.align as any) || 'center')
        setBgOpacity(typeof s.bgOpacity === 'number' ? s.bgOpacity : 0.85)
        setOutline(!!s.outline)
      }
    })
    const offT = (window.eApi.lyrics as any).onTheme?.((t: string) => applyTheme(t)) || (() => {})
    return () => { off(); offS(); offT?.() }
  }, [])

  const toggleLock = async () => {
    const next = !locked
    setLocked(next)
    await window.eApi.lyrics.lock(next)
  }

  // JS 拖动：按住窗口任意非按钮区域即可移动（主进程跟随光标），解决 CSS app-region 失效问题
  const onWindowMouseDown = (e: React.MouseEvent) => {
    if (locked) return
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('.dl-color-picker')) return
    e.preventDefault()
    window.eApi.lyrics.moveStart()
    const end = () => {
      window.eApi.lyrics.moveEnd()
      window.removeEventListener('mouseup', end)
    }
    window.addEventListener('mouseup', end)
  }

  const changeWidth = (dw: number) => window.eApi.lyrics.resize(dw)

  // 尺寸预设：单行 → 两行 → 三行 → 四行 → 六行 循环
  const cycleSize = () => {
    const next = (sizeIdx + 1) % WINDOW_SIZES.length
    setSizeIdx(next)
    const s = WINDOW_SIZES[next]
    window.eApi.lyrics.setSize(s.w, s.h)
  }

  const changeFontSize = async (delta: number) => {
    const next = Math.max(16, Math.min(52, fontSize + delta))
    setFontSize(next)
    await window.eApi.lyrics.settings({ fontSize: next })
  }

  const pickColor = async (c: string) => {
    setColor(c)
    setShowColors(false)
    await window.eApi.lyrics.settings({ color: c })
  }

  /** 背景快捷切换：清晰 → 半透明 → 完全隐藏 */
  const cycleBg = async () => {
    const order = [0.85, 0.5, 0]
    const idx = order.findIndex((v) => Math.abs(v - bgOpacity) < 0.02)
    const next = order[(idx + 1) % order.length]
    setBgOpacity(next)
    await window.eApi.lyrics.settings({ bgOpacity: next })
  }

  const { lines, active } = data
  const curLine = active >= 0 ? lines[active] : undefined
  const cover = coverUrl(data.cover, 300)

  return (
    <div
      className={`desktop-lyrics ${locked ? 'locked' : ''} dl-align-${align} ${bgOpacity <= 0.02 ? 'no-bg' : ''} ${outline ? 'outline' : ''}`}
      style={{ fontSize, ['--dl-color' as any]: color, ['--dl-alpha' as any]: Math.max(0, Math.min(1, bgOpacity)) }}
      onMouseDown={onWindowMouseDown}
    >
      {cover && <div className="dl-bg" style={{ backgroundImage: `url(${cover})` }} />}

      {/* 顶部拖动把手：未锁定时常显，按住即可移动窗口 */}
      <div className="dl-grip" title="按住拖动" />

      <div
        className={`dl-toolbar ${showBar ? 'show' : ''}`}
        onMouseEnter={() => setShowBar(true)}
        onMouseLeave={() => { setShowBar(false); setShowColors(false) }}
      >
        <div className="dl-title">
          <span className={`dl-eq ${data.isPlaying ? 'playing' : ''}`}><i /><i /><i /></span>
          <span className="dl-song">{data.title || 'yiyunmusic · 桌面歌词'}</span>
          {data.artist && <span className="dl-artist">— {data.artist}</span>}
        </div>
        <div className="dl-actions">
          <button title={`当前显示 ${rows} 行，点击放大窗口`} onClick={cycleSize}>⤢</button>
          <button title="减小窗口宽度" onClick={() => changeWidth(-120)}>⇤</button>
          <button title="增大窗口宽度" onClick={() => changeWidth(120)}>⇥</button>
          <button title="减小字号" onClick={() => changeFontSize(-2)}>A-</button>
          <button title="增大字号" onClick={() => changeFontSize(2)}>A+</button>
          <button title="歌词颜色" className={showColors ? 'active' : ''} onClick={() => setShowColors((v) => !v)}>🎨</button>
          <button
            title={`背景 ${Math.round(bgOpacity * 100)}%（点击切换：清晰 / 半透明 / 完全隐藏）`}
            className={bgOpacity <= 0.02 ? 'active' : ''}
            onClick={cycleBg}
          >◐</button>
          <button
            title={locked ? '解锁（可拖动/点击）' : '锁定（鼠标穿透）'}
            className={locked ? 'active' : ''}
            onClick={toggleLock}
          >
            {locked ? '🔒' : '🔓'}
          </button>
          <button title="关闭桌面歌词" className="dl-close" onClick={() => window.eApi.lyrics.winClose()}>✕</button>
        </div>
        {showColors && (
          <div className="dl-color-picker">
            {COLORS.map((c) => (
              <button key={c} title="选择颜色" style={{ background: c }} onClick={() => pickColor(c)} className={color === c ? 'sel' : ''} />
            ))}
          </div>
        )}
      </div>

      <div className={`dl-body dl-rows-${rows}`} ref={bodyRef} onMouseEnter={() => setShowBar(true)}>
        {lines.length > 0 ? (
          <>
            <ActiveLyric line={curLine} p={data} />
            {Array.from({ length: Math.max(0, rows - 1) }).map((_, i) => {
              const item = active >= 0 ? lines[active + i + 1] : undefined
              return (
                <div key={`next-${i}`} className={`dl-line next ${item ? '' : 'ghost'}`}>
                  <span>{item?.text || '　'}</span>
                </div>
              )
            })}
          </>
        ) : (
          <div className="dl-placeholder">
            {data.title ? '暂无歌词 · 播放歌曲后显示' : '播放歌曲后，逐字歌词将在这里流动'}
          </div>
        )}
      </div>
    </div>
  )
}
