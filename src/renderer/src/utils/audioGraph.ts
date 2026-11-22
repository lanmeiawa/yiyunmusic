/**
 * Web Audio 音频图：10 段图形均衡器 + 实时频谱/波形分析
 *
 * - MediaElementAudioSourceNode 只能创建一次，因此全部状态收敛在本模块。
 * - 频谱数据由主进程的本地音频代理提供同源流，避免跨域音源被 Web Audio 静音。
 * - 当分析器拿不到有效数据（例如降级直连音源）时，readSpectrum() 返回 null，
 *   可视化组件会自动切换到程序化律动，保证界面不会静止。
 */

export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
export const EQ_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']
export const EQ_PRESETS: Record<string, number[]> = {
  off: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  pop: [2, 3, 4, 2, -1, -1, 0, 1, 3, 3],
  rock: [6, 5, 2, -2, -2, 1, 4, 6, 6, 5],
  jazz: [4, 3, 2, 2, -1, -1, 1, 2, 4, 4],
  classical: [5, 4, 2, 2, 0, -1, -1, 1, 3, 4],
  electronic: [7, 6, 3, -1, -1, 2, 5, 6, 7, 6],
  vocal: [-2, -2, -1, 1, 4, 6, 5, 2, -1, -2],
  bass: [10, 8, 5, 2, -1, -2, -2, -1, 0, 0]
}
export const EQ_PRESET_LABELS: Record<string, string> = {
  off: '关闭', pop: '流行', rock: '摇滚', jazz: '爵士', classical: '古典',
  electronic: '电子', vocal: '人声', bass: '重低音'
}

let ctx: AudioContext | null = null
let source: MediaElementAudioSourceNode | null = null
let filters: BiquadFilterNode[] = []
let analyser: AnalyserNode | null = null
let freqData: Uint8Array | null = null
let waveData: Uint8Array | null = null
let bands: number[] = [...EQ_PRESETS.off]
/** 均衡器总开关：关闭时所有滤波器旁通为 0dB，但保留频谱分析能力 */
let eqEnabled = true

export function currentEqBands(): number[] { return [...bands] }
export function isEqEnabled(): boolean { return eqEnabled }
/** 音频图是否已经建立（一旦建立，跨域音源会被静音，必须走同源代理） */
export function hasAudioGraph(): boolean { return !!ctx }

/** 开启/旁通均衡器。旁通时不影响频谱读取，可视化仍可正常工作。 */
export function setEqEnabled(enabled: boolean) {
  eqEnabled = !!enabled
  if (!ctx || !filters.length) return
  const now = ctx.currentTime
  filters.forEach((f, i) => {
    const target = eqEnabled ? (bands[i] || 0) : 0
    try { f.gain.setTargetAtTime(target, now, 0.02) } catch { f.gain.value = target }
  })
}

/** 创建（或恢复）音频图。必须由用户手势或 play 事件触发。 */
export function ensureGraph(audio: HTMLAudioElement | null): boolean {
  if (!audio) return false
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return true
  }
  try {
    const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return false
    ctx = new AC()
    source = ctx.createMediaElementSource(audio)
    filters = EQ_FREQS.map((f, i) => {
      const b = ctx!.createBiquadFilter()
      b.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking'
      b.frequency.value = f
      if (b.type === 'peaking') b.Q.value = 1.0
      b.gain.value = eqEnabled ? (bands[i] || 0) : 0
      return b
    })
    analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.72
    freqData = new Uint8Array(analyser.frequencyBinCount)
    waveData = new Uint8Array(analyser.fftSize)
    let node: AudioNode = source
    for (const f of filters) { node.connect(f); node = f }
    node.connect(analyser)
    analyser.connect(ctx.destination)
    ctx.resume().catch(() => {})
    return true
  } catch (e) {
    console.warn('[audioGraph] 初始化失败', e)
    ctx = null
    source = null
    filters = []
    analyser = null
    return false
  }
}

/** 设置 10 段增益（dB）。若音频图尚未建立则先记住数值。 */
export function configureEq(values: number[] | undefined) {
  bands = values && values.length === EQ_FREQS.length ? [...values] : [...EQ_PRESETS.off]
  if (!ctx || !filters.length) return
  const now = ctx.currentTime
  filters.forEach((f, i) => {
    const target = eqEnabled ? (bands[i] || 0) : 0
    try { f.gain.setTargetAtTime(target, now, 0.02) } catch { f.gain.value = target }
  })
}

/** 读取频谱（0-255）。无有效数据时返回 null，交给可视化层程序化生成。 */
export function readSpectrum(): Uint8Array | null {
  if (!analyser || !freqData) return null
  analyser.getByteFrequencyData(freqData)
  let sum = 0
  for (let i = 0; i < freqData.length; i += 4) sum += freqData[i]
  return sum > 0 ? freqData : null
}

/** 读取时域波形，无有效数据时返回 null。 */
export function readWaveform(): Uint8Array | null {
  if (!analyser || !waveData) return null
  analyser.getByteTimeDomainData(waveData)
  let flat = true
  for (let i = 0; i < waveData.length; i += 8) {
    if (Math.abs(waveData[i] - 128) > 2) { flat = false; break }
  }
  return flat ? null : waveData
}

/* ==================== 语音转文本 PCM 采样 ==================== */
let captureNode: ScriptProcessorNode | null = null
let captureBuffer: number[] = []
let captureCb: ((pcm: Float32Array) => void) | null = null
const CAPTURE_RATE = 16000

/**
 * 从当前音频图抓取 PCM（16k 单声道），每当累积满 seconds 秒回调一次。
 * 用于把在线收音机的声音交给本地 ASR 识别。
 */
export function startPcmCapture(seconds: number, cb: (pcm: Float32Array) => void): boolean {
  if (!ctx || !analyser) return false
  stopPcmCapture()
  captureCb = cb
  captureBuffer = []
  try {
    captureNode = ctx.createScriptProcessor(4096, 1, 1)
    captureNode.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      // 重采样到 16k：按 ctx.sampleRate / 16000 步进取样
      const step = (ctx?.sampleRate || 44100) / CAPTURE_RATE
      for (let i = 0; i < input.length; i += step) captureBuffer.push(input[Math.floor(i)])
      // 静音跳过：避免把纯静音喂给识别器
      if (captureBuffer.length >= seconds * CAPTURE_RATE) {
        const peak = captureBuffer.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
        if (peak > 0.01 && captureCb) captureCb(new Float32Array(captureBuffer))
        captureBuffer = []
      }
    }
    // 接到分析器之后，不接到 destination（避免重复发声）
    analyser.connect(captureNode)
    captureNode.connect(ctx.destination)
    return true
  } catch { return false }
}

export function stopPcmCapture() {
  try { if (captureNode && analyser) analyser.disconnect(captureNode) } catch {}
  try { captureNode?.disconnect() } catch {}
  captureNode = null
  captureCb = null
  captureBuffer = []
}
