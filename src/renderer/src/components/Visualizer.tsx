import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../store'
import { readSpectrum, readWaveform } from '../utils/audioGraph'
import EqPanel from './EqPanel'

export type Shape =
  | 'bars' | 'mirror' | 'circle' | 'rings' | 'spiral'
  | 'cube' | 'sphere' | 'dots' | 'tunnel' | 'mandala'
  | 'starfield' | 'terrain' | 'kaleido' | 'orbit' | 'wave'

/** 形状清单（设置页与可视化面板共用，新增形状只改这里） */
export const SHAPES: { id: Shape; label: string; hint: string }[] = [
  { id: 'bars', label: '频谱柱', hint: '经典竖直频谱柱，低频到高频从左向右排列，底部带倒影' },
  { id: 'mirror', label: '镜像频谱', hint: '频谱以水平中线上下对称展开，形成随节拍伸缩的菱形晶体' },
  { id: 'circle', label: '圆环', hint: '频谱条围绕中心圆环向外放射，缓慢旋转并随低频脉动' },
  { id: 'rings', label: '脉冲环', hint: '多个同心圆从中心层层扩散，鼓点越强波纹越亮越粗' },
  { id: 'spiral', label: '螺旋', hint: '四圈阿基米德螺旋随频谱起伏，像被音乐牵引的星系旋臂' },
  { id: 'cube', label: '立方体', hint: '三层嵌套的 3D 线框立方体，随低频膨胀并多轴旋转' },
  { id: 'sphere', label: '星球', hint: '数百颗粒子组成旋转球体，前方粒子更亮，赤道带光环' },
  { id: 'dots', label: '点阵', hint: '矩阵式发光圆点按列逐层点亮，呈现复古 LED 电平表的跳动感' },
  { id: 'tunnel', label: '隧道', hint: '六边形光环由远及近迎面飞来，营造穿越音频隧道的纵深感' },
  { id: 'mandala', label: '曼陀罗', hint: '多层十二瓣对称花纹缓慢旋转，花瓣随各频段呼吸开合' },
  { id: 'starfield', label: '星域', hint: '星尘从画面中心向外飞驰，低频越强飞行越快、拖尾越亮' },
  { id: 'terrain', label: '地形', hint: '起伏的网格山脊随频谱涌动，像低空掠过被音乐塑形的山脉' },
  { id: 'kaleido', label: '万花筒', hint: '扇区镜像复制频谱，八重对称旋转，呈现不断变幻的几何花纹' },
  { id: 'orbit', label: '轨道', hint: '多个椭圆轨道环绕中心，发光星体随节奏加速公转' },
  { id: 'wave', label: '波形', hint: '示波器式声波曲线，双轨镜像叠加，实时描出声音的振幅' }
]

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const COLOR_SECOND = '#9b8cff'
/** 频谱复用缓冲区，避免每帧分配 Float32Array 造成 GC 抖动 */
const spectrumBuffer = new Float32Array(64)
/** 渐变缓存：仅在尺寸或颜色变化时重建，避免每帧 createGradient */
const gradientCache = new Map<string, CanvasGradient>()
function cachedGradient(_ctx: CanvasRenderingContext2D, key: string, make: () => CanvasGradient): CanvasGradient {
  let g = gradientCache.get(key)
  if (!g) { g = make(); gradientCache.clear(); gradientCache.set(key, g) }
  return g
}

/** 音源不可用时的程序化律动，保证可视化始终有呼吸感 */
function simulated(i: number, n: number, t: number, playing: boolean): number {
  if (!playing) return 0.035 + 0.025 * Math.sin(i * 0.32 + t * 0.8)
  const x = i / n
  const beat = Math.pow(Math.max(0, Math.sin(t * 3.1)), 8)
  return clamp(
    0.12 + 0.26 * Math.abs(Math.sin(x * 7.3 + t * 2.0)) +
    0.20 * Math.abs(Math.sin(x * 19.1 - t * 3.4)) +
    beat * 0.34 * (1 - x * 0.55) + 0.06 * Math.sin(x * 41 + t * 5)
  )
}

function spectrumValues(spec: Uint8Array | null, t: number, playing: boolean, sens: number, n = 64): Float32Array {
  const out = spectrumBuffer
  for (let i = 0; i < n; i++) {
    let v: number
    if (spec) {
      // 对数取样：低频占更多柱子，更接近听感
      const idx = Math.min(spec.length - 1, Math.floor(Math.pow(i / n, 1.65) * spec.length * 0.68))
      // 非线性增益：低幅度信号提升更明显，低频再做 18% 补偿，让轻微音量也能看清律动
      v = Math.pow(spec[idx] / 255, 0.72) * (1 + 0.18 * (1 - i / n))
    } else {
      v = simulated(i, n, t, playing)
    }
    out[i] = clamp(v * sens)
  }
  return out
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return `rgba(255,107,139,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** 形状下拉选择器：十几种形状收进下拉面板，选中项展开显示图形说明 */
export function ShapePicker({ value, onChange, dark = true }: { value: string; onChange: (v: Shape) => void; dark?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [pos, setPos] = React.useState<{ left: number; top: number; bottom: number; maxH: number; down: boolean } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 菜单不可放进滚动容器，否则会被 overflow 裁掉：Portal 到 body + fixed 定位。
  // 按触发按钮上下可用空间自动选择展开方向，并限制最大高度，保证完整可见。
  const place = () => {
    const r = boxRef.current?.getBoundingClientRect()
    if (!r) return
    // 触发按钮滚出视口后菜单已无意义，直接收起
    if (r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return }
    const width = 336
    const gap = 8
    const margin = 12
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, r.left + r.width / 2 - width / 2))
    const spaceBelow = window.innerHeight - r.bottom - gap - margin
    const spaceAbove = r.top - gap - margin
    const down = spaceBelow >= spaceAbove
    const maxH = Math.max(160, Math.min(360, down ? spaceBelow : spaceAbove))
    setPos({
      left,
      top: r.bottom + gap,
      bottom: Math.max(margin, window.innerHeight - r.top + gap),
      maxH,
      down
    })
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (boxRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    // 滚动/缩放时重新定位跟随按钮，而不是关闭菜单
    let raf = 0
    const reposition = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; place() })
    }
    const onScroll = (e: Event) => {
      // 菜单自身内容滚动不需要重新定位
      if (menuRef.current?.contains(e.target as Node)) return
      reposition()
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const cur = SHAPES.find((s) => s.id === value) || SHAPES[0]
  const toggle = () => {
    if (!open) place()
    setOpen((v) => !v)
  }

  return (
    <div className={`shape-picker ${dark ? 'dark' : ''}`} ref={boxRef}>
      <button className="shape-picker-trigger" onClick={toggle} title="选择可视化形状">
        <span className="shape-picker-name">{cur.label}</span>
        <em>{open ? '▲' : '▼'}</em>
      </button>
      {open && pos && createPortal(
        <div
          className={`shape-picker-menu ${dark ? 'dark' : 'light'}`}
          ref={menuRef}
          style={{ left: pos.left, maxHeight: pos.maxH, ...(pos.down ? { top: pos.top } : { bottom: pos.bottom }) }}
        >
          {SHAPES.map((s) => (
            <button
              key={s.id}
              className={`shape-picker-item ${s.id === value ? 'sel' : ''}`}
              onClick={() => { onChange(s.id); setOpen(false) }}
            >
              <b>{s.label}</b>
              <span>{s.hint}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

export default function Visualizer() {
  const { customization, setCustomization, player } = useApp()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [showEq, setShowEq] = React.useState(false)
  const stateRef = useRef({ shape: customization.visualShape || 'bars', playing: false, sens: 1.6, color: '#ff6b8b' })
  stateRef.current.shape = customization.visualShape || 'bars'
  stateRef.current.playing = player.isPlaying
  stateRef.current.sens = customization.visualSensitivity || 1.6

  useEffect(() => {
    const readColor = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
      stateRef.current.color = /^#[0-9a-f]{6}$/i.test(v) ? v : '#ff6b8b'
    }
    readColor()
    const timer = setInterval(readColor, 1500)
    return () => clearInterval(timer)
  }, [customization.primary, customization.soundFx])

  const enabled = customization.visualizerEnabled !== false

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    // desynchronized 让 canvas 走低延迟合成路径，配合主进程 GPU 开关可显著降低填充开销
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true } as any)
    if (!ctx) return
    let w = 0
    let h = 0
    let raf = 0
    let lastFrame = 0
    let hidden = document.hidden
    const onVisibility = () => { hidden = document.hidden; lastFrame = 0 }
    document.addEventListener('visibilitychange', onVisibility)
    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      // DPR 上限 1.5：高分屏下像素填充量减少约 44%，肉眼几乎无差别
      const dpr = Math.min(1.5, window.devicePixelRatio || 1)
      w = Math.max(1, rect.width)
      h = Math.max(1, rect.height)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw)
      // 页面不可见时完全停绘；暂停播放时降到约 11fps，播放时约 30fps
      if (hidden) return
      const gap = stateRef.current.playing ? 33 : 90
      if (ts - lastFrame < gap) return
      lastFrame = ts
      const t = ts / 1000
      const { shape, playing, sens, color } = stateRef.current
      const spec = readSpectrum()
      const wave = readWaveform()
      const v = spectrumValues(spec, t, playing, sens)
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (shape === 'bars') drawBars(ctx, w, h, v, color, t)
      else if (shape === 'mirror') drawMirror(ctx, w, h, v, color)
      else if (shape === 'circle') drawCircle(ctx, w, h, v, color, t)
      else if (shape === 'rings') drawRings(ctx, w, h, v, color, t)
      else if (shape === 'spiral') drawSpiral(ctx, w, h, v, color, t)
      else if (shape === 'cube') drawCube(ctx, w, h, v, color, t)
      else if (shape === 'sphere') drawSphere(ctx, w, h, v, color, t)
      else if (shape === 'dots') drawDots(ctx, w, h, v, color)
      else if (shape === 'tunnel') drawTunnel(ctx, w, h, v, color, t)
      else if (shape === 'mandala') drawMandala(ctx, w, h, v, color, t)
      else if (shape === 'starfield') drawStarfield(ctx, w, h, v, color, t)
      else if (shape === 'terrain') drawTerrain(ctx, w, h, v, color, t)
      else if (shape === 'kaleido') drawKaleido(ctx, w, h, v, color, t)
      else if (shape === 'orbit') drawOrbit(ctx, w, h, v, color, t)
      else drawWave(ctx, w, h, v, color, t, wave, playing)

      ctx.restore()
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      gradientCache.clear()
    }
  }, [enabled])

  return (
    <div className="visualizer" ref={wrapRef}>
      <canvas ref={canvasRef} className="visualizer-canvas" />
      {!enabled && (
        <div className="visualizer-off">
          <div className="visualizer-off-glyph">◈</div>
          <h3>音乐可视化已关闭</h3>
          <p>开启后即可看到随音乐律动的频谱柱、立方体与粒子星球</p>
          <button onClick={() => setCustomization({ visualizerEnabled: true })}>开启可视化</button>
          <span>关闭时不启动渲染循环，播放更省资源</span>
        </div>
      )}
      <div className="visualizer-info">
        <span className="visualizer-tag">MUSIC VISUALIZER</span>
        <h2>{player.current?.name || '播放一首歌曲'}</h2>
        <p>{player.current?.artists?.map((a) => a.name).join(' / ') || '让旋律变成看得见的形状'}</p>
      </div>
      <div className={`visualizer-controls ${enabled ? '' : 'dimmed'}`}>
        <div className="visualizer-shapes">
          <span className="visualizer-shape-label">形状</span>
          <ShapePicker
            value={customization.visualShape || 'bars'}
            onChange={(v) => setCustomization({ visualShape: v })}
          />
        </div>
        <div className="visualizer-tools">
          <label className="visualizer-sens" title="可视化灵敏度">
            <span>灵敏度</span>
            <input
              type="range" min={0.5} max={4} step={0.1}
              value={customization.visualSensitivity || 1.6}
              onChange={(e) => setCustomization({ visualSensitivity: Number(e.target.value) })}
            />
            <em>{(customization.visualSensitivity || 1.6).toFixed(1)}x</em>
          </label>
          <button className={`visualizer-shape ${showEq ? 'sel' : ''}`} onClick={() => setShowEq((v) => !v)}>
            均衡器 {showEq ? '收起' : '展开'}
          </button>
        </div>
      </div>
      {showEq && (
        <div className="visualizer-eq">
          <div className="visualizer-eq-head"><b>10 段图形均衡器</b><span>实时调节各频段增益</span></div>
          <EqPanel compact />
        </div>
      )}
    </div>
  )
}

/* ============================ 绘制实现 ============================ */

function drawBars(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string, t: number) {
  const n = v.length
  const pad = Math.max(18, w * 0.035)
  const bw = (w - pad * 2) / n
  const base = h * 0.76
  const maxH = h * 0.58
  const grad = cachedGradient(ctx, `bars|${Math.round(base)}|${Math.round(maxH)}|${color}`, () => {
    const g = ctx.createLinearGradient(0, base - maxH, 0, base)
    g.addColorStop(0, COLOR_SECOND)
    g.addColorStop(0.45, color)
    g.addColorStop(1, hexToRgba(color, 0.35))
    return g
  })
  ctx.fillStyle = grad
  ctx.shadowColor = hexToRgba(color, 0.45)
  ctx.shadowBlur = 8
  for (let i = 0; i < n; i++) {
    const bh = Math.max(3, v[i] * maxH)
    const x = pad + i * bw
    ctx.globalAlpha = 0.55 + v[i] * 0.45
    ctx.beginPath()
    ctx.roundRect(x + 1, base - bh, Math.max(1.5, bw - 2.5), bh, Math.min(4, bw / 2))
    ctx.fill()
    // 底部倒影
    ctx.globalAlpha = 0.1 + v[i] * 0.14
    ctx.beginPath()
    ctx.roundRect(x + 1, base + 3, Math.max(1.5, bw - 2.5), bh * 0.28, 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  ctx.strokeStyle = hexToRgba(color, 0.18)
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(pad, base + 0.5); ctx.lineTo(w - pad, base + 0.5); ctx.stroke()
  // 缓慢流动的高光点
  ctx.fillStyle = '#fff'
  ctx.globalAlpha = 0.5
  const px = pad + ((t * 90) % (w - pad * 2))
  ctx.beginPath(); ctx.arc(px, base, 2.2, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
}

function drawCircle(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string, t: number) {
  const cx = w / 2
  const cy = h / 2
  const R = Math.min(w, h) * 0.2
  const count = 64
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(t * 0.09)
  ctx.shadowColor = color
  ctx.shadowBlur = 8
  for (let i = 0; i < count; i++) {
    const val = v[i % v.length]
    const a = (i / count) * Math.PI * 2
    const len = 6 + val * R * 0.95
    ctx.strokeStyle = i % 3 === 0 ? COLOR_SECOND : hexToRgba(color, 0.55 + val * 0.45)
    ctx.lineWidth = Math.max(1.5, (Math.PI * 2 * R / count) * 0.55)
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R)
    ctx.lineTo(Math.cos(a) * (R + len), Math.sin(a) * (R + len))
    ctx.stroke()
  }
  ctx.restore()
  // 中心光晕
  const glow = cachedGradient(ctx, `circle|${Math.round(cx)}|${Math.round(cy)}|${Math.round(R)}|${color}`, () => {
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, R)
    g.addColorStop(0, hexToRgba(color, 0.4))
    g.addColorStop(0.55, hexToRgba(COLOR_SECOND, 0.12))
    g.addColorStop(1, hexToRgba(color, 0))
    return g
  })
  ctx.fillStyle = glow
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = hexToRgba(color, 0.32)
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.72, 0, Math.PI * 2); ctx.stroke()
  ctx.setLineDash([3, 9])
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.62, 0, Math.PI * 2); ctx.stroke()
  ctx.setLineDash([])
}

type V3 = { x: number; y: number; z: number }
const CUBE_VERTS: V3[] = [
  { x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 },
  { x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }
]
const CUBE_EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]

function drawCube(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string, t: number) {
  const cx = w / 2
  const cy = h / 2
  const bass = (v[0] + v[1] + v[2] + v[3]) / 4
  const size = Math.min(w, h) * 0.19 * (1 + bass * 0.28)
  const ay = t * 0.55
  const ax = Math.sin(t * 0.31) * 0.42
  const project = (p: V3, scale: number) => {
    const cy1 = Math.cos(ay), sy = Math.sin(ay)
    let x = p.x * cy1 - p.z * sy
    let z = p.x * sy + p.z * cy1
    const cx1 = Math.cos(ax), sx = Math.sin(ax)
    const y = p.y * cx1 - z * sx
    z = p.y * sx + z * cx1
    const f = 2.8 / (4 - z)
    return { x: cx + x * size * scale * f * 1.5, y: cy + y * size * scale * f * 1.5, z }
  }
  const layers = [1, 0.66, 0.36]
  layers.forEach((scale, li) => {
    const pts = CUBE_VERTS.map((p, i) => project({ x: p.x, y: p.y, z: p.z }, scale * (1 + (v[(i * 5) % 64] || 0) * 0.22)))
    ctx.strokeStyle = li === 0 ? hexToRgba(color, 0.95) : hexToRgba(COLOR_SECOND, li === 1 ? 0.5 : 0.25)
    ctx.lineWidth = li === 0 ? 2.4 : 1
    ctx.shadowColor = color
    ctx.shadowBlur = li === 0 ? 10 : 0
    CUBE_EDGES.forEach(([a, b]) => {
      const p1 = pts[a], p2 = pts[b]
      ctx.globalAlpha = clamp(0.45 + (p1.z + p2.z + 4) / 12, 0.3, 1)
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke()
    })
    if (li === 0) {
      ctx.shadowBlur = 6
      pts.forEach((p, i) => {
        ctx.fillStyle = i % 2 ? COLOR_SECOND : '#fff'
        ctx.globalAlpha = 0.75
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 + v[(i * 5) % 64] * 4, 0, Math.PI * 2); ctx.fill()
      })
    }
  })
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

function drawSphere(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string, t: number) {
  const cx = w / 2
  const cy = h / 2
  const R = Math.min(w, h) * 0.24
  const ay = t * 0.3
  const ax = 0.3 + Math.sin(t * 0.2) * 0.18
  const latN = 12
  const lonN = 28
  for (let la = 0; la < latN; la++) {
    const phi = -Math.PI / 2 + (la / (latN - 1)) * Math.PI
    for (let lo = 0; lo < lonN; lo++) {
      const theta = (lo / lonN) * Math.PI * 2
      const val = v[(la * 7 + lo * 3) % v.length]
      const r = R * (0.88 + val * 0.26)
      let x = Math.cos(phi) * Math.cos(theta) * r
      let y = Math.sin(phi) * r
      let z = Math.cos(phi) * Math.sin(theta) * r
      // 绕 Y / X 轴旋转
      const nx = x * Math.cos(ay) - z * Math.sin(ay)
      const nz0 = x * Math.sin(ay) + z * Math.cos(ay)
      const ny = y * Math.cos(ax) - nz0 * Math.sin(ax)
      z = y * Math.sin(ax) + nz0 * Math.cos(ax)
      x = nx; y = ny
      const f = 2.7 / (4 - z / R)
      const px = cx + x * f
      const py = cy + y * f
      const depth = clamp((z / R + 1) / 2, 0, 1)
      ctx.globalAlpha = 0.2 + depth * 0.75
      ctx.fillStyle = (la + lo) % 5 === 0 ? COLOR_SECOND : color
      ctx.beginPath(); ctx.arc(px, py, (0.9 + val * 2.6) * (0.7 + depth * 0.7), 0, Math.PI * 2); ctx.fill()
    }
  }
  // 赤道光环
  ctx.globalAlpha = 0.42
  ctx.strokeStyle = color
  ctx.lineWidth = 1.2
  ctx.shadowColor = color
  ctx.shadowBlur = 8
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(ax)
  ctx.beginPath()
  ctx.ellipse(0, 0, R * 1.5, R * 0.3, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

function drawWave(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string, t: number, wave: Uint8Array | null, playing: boolean) {
  const cy = h / 2
  const amp = h * 0.3
  const sample = (x: number) => {
    if (wave) {
      const idx = Math.min(wave.length - 1, Math.floor((x / w) * wave.length))
      return (wave[idx] - 128) / 128
    }
    const i = Math.floor((x / w) * v.length) % v.length
    return Math.sin(x * 0.018 + t * 4) * v[i] * (playing ? 1 : 0.25)
  }
  const grad = cachedGradient(ctx, `wave|${Math.round(w)}|${color}`, () => {
    const g = ctx.createLinearGradient(0, 0, w, 0)
    g.addColorStop(0, hexToRgba(COLOR_SECOND, 0.5))
    g.addColorStop(0.5, color)
    g.addColorStop(1, COLOR_SECOND)
    return g
  })
  for (const [scale, alpha, lw] of [[1, 1, 3], [-0.55, 0.22, 1.5]] as const) {
    ctx.strokeStyle = grad
    ctx.globalAlpha = alpha
    ctx.lineWidth = lw
    ctx.shadowColor = color
    ctx.shadowBlur = alpha === 1 ? 12 : 0
    ctx.beginPath()
    for (let x = 0; x <= w; x += 2) {
      const y = cy + sample(x) * amp * scale
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

/* ============================ 新增形状 ============================ */

/** 镜像频谱：以水平中线对称展开，形成随节拍伸缩的菱形晶体 */
function drawMirror(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string) {
  const n = v.length
  const pad = Math.max(18, w * 0.04)
  const bw = (w - pad * 2) / n
  const cy = h / 2
  const maxH = h * 0.36
  const grad = cachedGradient(ctx, `mirror|${Math.round(cy)}|${Math.round(maxH)}|${color}`, () => {
    const g = ctx.createLinearGradient(0, cy - maxH, 0, cy + maxH)
    g.addColorStop(0, hexToRgba(COLOR_SECOND, 0.18))
    g.addColorStop(0.5, color)
    g.addColorStop(1, hexToRgba(COLOR_SECOND, 0.18))
    return g
  })
  ctx.fillStyle = grad
  ctx.shadowColor = hexToRgba(color, 0.4)
  ctx.shadowBlur = 8
  for (let i = 0; i < n; i++) {
    const bh = Math.max(2, v[i] * maxH)
    const x = pad + i * bw
    ctx.globalAlpha = 0.55 + v[i] * 0.45
    ctx.beginPath()
    ctx.roundRect(x + 1, cy - bh, Math.max(1.5, bw - 2.5), bh * 2, Math.min(3, bw / 2))
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  ctx.strokeStyle = hexToRgba(color, 0.35)
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(pad, cy + 0.5); ctx.lineTo(w - pad, cy + 0.5); ctx.stroke()
}

/** 脉冲环：多个同心波纹从中心层层向外扩散 */
function drawRings(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string, t: number) {
  const cx = w / 2
  const cy = h / 2
  const R = Math.min(w, h) * 0.42
  const bass = (v[0] + v[1] + v[2] + v[3]) / 4
  const count = 7
  for (let k = 0; k < count; k++) {
    const phase = (t * 0.32 + k / count) % 1
    const r = R * (0.06 + phase * 0.94)
    const val = v[(k * 7) % v.length]
    const alpha = Math.sin(phase * Math.PI) * (0.28 + val * 0.55) + 0.05
    ctx.strokeStyle = k % 2 ? hexToRgba(COLOR_SECOND, alpha) : hexToRgba(color, alpha)
    ctx.lineWidth = 1 + val * 2.6
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
  }
  const coreR = R * (0.05 + bass * 0.12)
  const glow = cachedGradient(ctx, `rings|${Math.round(coreR)}|${color}`, () => {
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, coreR * 2.6)
    g.addColorStop(0, hexToRgba(color, 0.85))
    g.addColorStop(0.4, hexToRgba(color, 0.3))
    g.addColorStop(1, hexToRgba(color, 0))
    return g
  })
  ctx.fillStyle = glow
  ctx.beginPath(); ctx.arc(cx, cy, coreR * 2.6, 0, Math.PI * 2); ctx.fill()
}

/** 螺旋：阿基米德螺旋随频谱起伏，像被音乐牵引的星系旋臂 */
function drawSpiral(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string, t: number) {
  const cx = w / 2
  const cy = h / 2
  const maxR = Math.min(w, h) * 0.4
  const turns = 4
  const steps = 240
  ctx.beginPath()
  for (let i = 0; i <= steps; i++) {
    const p = i / steps
    const a = p * Math.PI * 2 * turns + t * 0.45
    const val = v[Math.min(v.length - 1, Math.floor(p * v.length))]
    const r = maxR * p * (0.72 + val * 0.55)
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 2.1
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.stroke()
  ctx.shadowBlur = 0
  for (let k = 0; k < 24; k++) {
    const p = (k / 24 + t * 0.04) % 1
    const a = p * Math.PI * 2 * turns + t * 0.45
    const val = v[Math.min(v.length - 1, Math.floor(p * v.length))]
    const r = maxR * p * (0.72 + val * 0.55)
    ctx.fillStyle = k % 3 === 0 ? COLOR_SECOND : '#fff'
    ctx.globalAlpha = 0.35 + val * 0.6
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.4 + val * 1.8, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
}

/** 点阵：复古 LED 电平表，按列逐层点亮 */
function drawDots(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string) {
  const cols = 32
  const rows = 10
  const padX = w * 0.06
  const top = h * 0.16
  const cw = (w - padX * 2) / cols
  const ch = (h * 0.68) / rows
  for (let c = 0; c < cols; c++) {
    const val = v[Math.min(v.length - 1, Math.floor(c / cols * v.length))]
    const lit = Math.max(1, Math.round(val * rows))
    for (let r = 0; r < rows; r++) {
      const active = r >= rows - lit
      ctx.fillStyle = active ? (c % 4 === 0 ? COLOR_SECOND : color) : hexToRgba(color, 0.14)
      ctx.globalAlpha = active ? 0.45 + val * 0.55 : 0.5
      ctx.beginPath()
      ctx.arc(padX + c * cw + cw / 2, top + r * ch + ch / 2, active ? 2.2 + val * 1.6 : 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

/** 隧道：六边形光环由远及近迎面飞来 */
function drawTunnel(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string, t: number) {
  const cx = w / 2
  const cy = h / 2
  const maxSize = Math.min(w, h) * 0.58
  const bass = (v[0] + v[1] + v[2] + v[3]) / 4
  const count = 9
  const sides = 6
  for (let k = 0; k < count; k++) {
    const phase = (t * 0.36 + k / count) % 1
    const size = maxSize * (0.06 + phase * 0.94) * (1 + bass * 0.08)
    const val = v[(k * 5) % v.length]
    const alpha = Math.sin(phase * Math.PI) * (0.3 + val * 0.5) + 0.04
    ctx.strokeStyle = k % 3 === 0 ? hexToRgba(COLOR_SECOND, alpha) : hexToRgba(color, alpha)
    ctx.lineWidth = 1 + phase * 2
    ctx.beginPath()
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2 + t * 0.07
      const x = cx + Math.cos(a) * size
      const y = cy + Math.sin(a) * size
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

/** 曼陀罗：多层十二瓣对称花纹缓慢旋转，花瓣随频段呼吸开合 */
function drawMandala(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string, t: number) {
  const cx = w / 2
  const cy = h / 2
  const R = Math.min(w, h) * 0.32
  const petals = 12
  const layers = 4
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(t * 0.07)
  for (let l = 0; l < layers; l++) {
    const val = v[(l * 11) % v.length]
    const rr = R * (0.32 + l * 0.21) * (1 + val * 0.16)
    ctx.strokeStyle = l % 2 ? hexToRgba(COLOR_SECOND, 0.3 + val * 0.5) : hexToRgba(color, 0.36 + val * 0.55)
    ctx.lineWidth = 1.1 + val * 1.3
    ctx.save()
    ctx.rotate(l * Math.PI / layers)
    for (let p = 0; p < petals; p++) {
      ctx.save()
      ctx.rotate(p * Math.PI * 2 / petals)
      ctx.beginPath()
      ctx.ellipse(rr * 0.72, 0, rr * 0.42, rr * 0.15, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
    ctx.fillStyle = l % 2 ? COLOR_SECOND : color
    ctx.globalAlpha = 0.3 + val * 0.6
    for (let p = 0; p < petals; p++) {
      const a = p * Math.PI * 2 / petals + l * Math.PI / layers
      ctx.beginPath()
      ctx.arc(Math.cos(a) * rr * 1.18, Math.sin(a) * rr * 1.18, 1.2 + val * 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
  ctx.fillStyle = hexToRgba(color, 0.55)
  ctx.beginPath(); ctx.arc(0, 0, R * 0.08, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

/* ============================ 星空 / 地形 / 万花筒 / 轨道 ============================ */

/** 星域：星尘从中心向外飞驰，低频驱动速度与亮度 */
function drawStarfield(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string, t: number) {
  const cx = w / 2
  const cy = h / 2
  const bass = (v[0] + v[1] + v[2] + v[3]) / 4
  const maxR = Math.hypot(w, h) * 0.6
  const count = 110
  for (let i = 0; i < count; i++) {
    const s1 = ((i * 9301 + 49297) % 233280) / 233280
    const s2 = ((i * 7919 + 104729) % 233280) / 233280
    const ang = s1 * Math.PI * 2
    const speed = 0.12 + s2 * 0.22 + bass * 0.18
    const phase = (t * speed + s2) % 1
    const r = phase * maxR
    const val = v[i % v.length]
    const x = cx + Math.cos(ang) * r
    const y = cy + Math.sin(ang) * r * 0.68
    const size = Math.max(0.4, (0.5 + s1 * 1.8) * (0.4 + phase * 1.6) * (1 + val * 0.8))
    const tint = i % 6 === 0 ? COLOR_SECOND : i % 13 === 0 ? '#fff' : color
    ctx.globalAlpha = Math.min(1, (1 - phase) * 1.15) * (0.4 + val * 0.6)
    ctx.fillStyle = tint
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill()
    if (phase > 0.16 && i % 3 === 0) {
      ctx.globalAlpha *= 0.28
      ctx.strokeStyle = tint
      ctx.lineWidth = Math.max(0.5, size * 0.5)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(ang) * r * 0.9, cy + Math.sin(ang) * r * 0.9 * 0.68)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
  const coreR = Math.min(w, h) * 0.03 * (1 + bass * 1.2)
  const glow = cachedGradient(ctx, `star|${Math.round(coreR)}|${color}`, () => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3)
    g.addColorStop(0, hexToRgba(color, 0.9))
    g.addColorStop(0.4, hexToRgba(COLOR_SECOND, 0.25))
    g.addColorStop(1, hexToRgba(color, 0))
    return g
  })
  ctx.fillStyle = glow
  ctx.beginPath(); ctx.arc(cx, cy, coreR * 3, 0, Math.PI * 2); ctx.fill()
}

/** 地形：起伏的网格山脊随频谱涌动 */
function drawTerrain(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string, t: number) {
  const rows = 14
  const cols = 26
  const top = h * 0.34
  const rowH = (h * 0.46) / rows
  const colW = w / cols
  const pts: number[][] = []
  for (let r = 0; r <= rows; r++) {
    const depth = r / rows
    const line: number[] = []
    for (let c = 0; c <= cols; c++) {
      const val = v[Math.floor((c / cols) * (v.length - 1))]
      const wave = 0.45 + 0.55 * Math.abs(Math.sin(depth * 3.2 + c * 0.35 - t * 1.1))
      line.push(top + r * rowH - val * rowH * 2.6 * wave * (1 - depth * 0.35))
    }
    pts.push(line)
  }
  // 横向山脊线
  for (let r = 0; r <= rows; r++) {
    const depth = r / rows
    ctx.strokeStyle = r % 3 === 0 ? hexToRgba(color, 0.55 - depth * 0.25) : hexToRgba(COLOR_SECOND, 0.3 - depth * 0.16)
    ctx.lineWidth = r % 3 === 0 ? 1.4 : 0.9
    ctx.beginPath()
    for (let c = 0; c <= cols; c++) {
      const x = c * colW
      const y = pts[r][c]
      if (c === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  // 纵向连接线
  for (let c = 0; c <= cols; c += 2) {
    ctx.strokeStyle = hexToRgba(color, 0.18)
    ctx.lineWidth = 0.8
    ctx.beginPath()
    for (let r = 0; r <= rows; r++) {
      const x = c * colW
      const y = pts[r][c]
      if (r === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  // 前沿波峰光点
  ctx.fillStyle = '#fff'
  for (let c = 0; c <= cols; c += 3) {
    const val = v[Math.floor((c / cols) * (v.length - 1))]
    if (val < 0.35) continue
    ctx.globalAlpha = val * 0.7
    ctx.beginPath(); ctx.arc(c * colW, pts[rows][c], 1.4 + val * 2, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
}

/** 万花筒：八重镜像扇区复制频谱 */
function drawKaleido(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string, t: number) {
  const cx = w / 2
  const cy = h / 2
  const R = Math.min(w, h) * 0.42
  const seg = 8
  const bars = 12
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(t * 0.1)
  for (let s = 0; s < seg; s++) {
    ctx.save()
    ctx.rotate((s * Math.PI * 2) / seg)
    if (s % 2) ctx.scale(1, -1)
    for (let i = 0; i < bars; i++) {
      const val = v[(i * 3 + s) % v.length]
      const a = (i / bars) * ((Math.PI * 2) / seg) * 0.92
      const len = R * (0.35 + val * 0.62)
      ctx.strokeStyle = i % 3 === 0 ? hexToRgba(COLOR_SECOND, 0.35 + val * 0.5) : hexToRgba(color, 0.3 + val * 0.55)
      ctx.lineWidth = 1.2 + val * 2.4
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * R * 0.18, Math.sin(a) * R * 0.18)
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len)
      ctx.stroke()
    }
    ctx.restore()
  }
  ctx.restore()
  ctx.fillStyle = hexToRgba(color, 0.75)
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.06, 0, Math.PI * 2); ctx.fill()
}

/** 轨道：多个椭圆轨道环绕中心，星体随节奏公转 */
function drawOrbit(ctx: CanvasRenderingContext2D, w: number, h: number, v: Float32Array, color: string, t: number) {
  const cx = w / 2
  const cy = h / 2
  const R = Math.min(w, h) * 0.36
  const rings = 4
  for (let k = 0; k < rings; k++) {
    const rv = v[(k * 8) % v.length]
    const rx = R * (0.42 + k * 0.2) * (1 + rv * 0.12)
    const ry = rx * (0.4 + k * 0.06)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(-0.3 + k * 0.2)
    ctx.strokeStyle = hexToRgba(k % 2 ? COLOR_SECOND : color, 0.14 + rv * 0.22)
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke()
    for (let p = 0; p < 3; p++) {
      const a = t * (0.5 + k * 0.16) + (p * Math.PI * 2) / 3
      ctx.fillStyle = p % 2 ? COLOR_SECOND : '#fff'
      ctx.globalAlpha = 0.5 + rv * 0.5
      ctx.beginPath(); ctx.arc(Math.cos(a) * rx, Math.sin(a) * ry, 1.5 + rv * 3, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }
  const bass = (v[0] + v[1] + v[2] + v[3]) / 4
  const coreR = R * 0.1 * (1 + bass * 0.4)
  const glow = cachedGradient(ctx, `orbit|${Math.round(coreR)}|${color}`, () => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.2)
    g.addColorStop(0, '#fff')
    g.addColorStop(0.35, hexToRgba(color, 0.8))
    g.addColorStop(1, hexToRgba(color, 0))
    return g
  })
  ctx.fillStyle = glow
  ctx.beginPath(); ctx.arc(cx, cy, coreR * 2.2, 0, Math.PI * 2); ctx.fill()
}
