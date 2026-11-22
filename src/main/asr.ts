/**
 * 本地语音转文本（离线，无需网络）
 * 引擎：sherpa-onnx (Apache-2.0) + SenseVoice int8 多语言模型
 * 模型目录：userData/asr-model/{model.int8.onnx, tokens.txt}
 * 下载源：hf-mirror（国内可直连），带进度回调
 */
import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain } from 'electron'

const MODEL_DIR = () => path.join(app.getPath('userData'), 'asr-model')
const MODEL_FILE = () => path.join(MODEL_DIR(), 'model.int8.onnx')
const TOKENS_FILE = () => path.join(MODEL_DIR(), 'tokens.txt')
// 多镜像：优先国内 hf-mirror，失败回退官方 huggingface / gitee
const BASES = [
  'https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main',
  'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main'
]
const MODEL_SIZE = 228 * 1024 * 1024 // 仅用于进度估算
/** 安装时询问后写入的标记：首次启动自动下载模型 */
const WANT_FILE = () => path.join(MODEL_DIR(), 'wanted')

export function modelStatus(): { ready: boolean; size: number; path: string } {
  try {
    const ok = fs.existsSync(MODEL_FILE()) && fs.existsSync(TOKENS_FILE()) && fs.statSync(MODEL_FILE()).size > 1000000
    return { ready: ok, size: ok ? fs.statSync(MODEL_FILE()).size : 0, path: MODEL_DIR() }
  } catch { return { ready: false, size: 0, path: MODEL_DIR() } }
}

/** 下载单个文件：多镜像回退 + 断点续传 + 进度。fileName 用于拼镜像路径 */
async function downloadFile(fileName: string, dest: string, onProgress?: (pct: number) => void): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const tmp = dest + '.part'
  let lastErr: any
  for (const base of BASES) {
    try {
      // 断点续传：已有 .part 则从已下载字节处继续
      const existing = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0
      const headers: Record<string, string> = existing > 0 ? { Range: `bytes=${existing}-` } : {}
      const res = await fetch(`${base}/${fileName}`, { headers })
      // 206=从断点继续；200=服务器忽略 Range（需从头写）
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
      const append = res.status === 206 && existing > 0
      const total = (Number(res.headers.get('content-length')) || 0) + (append ? existing : 0) || MODEL_SIZE
      let received = append ? existing : 0
      const out = fs.createWriteStream(tmp, { flags: append ? 'a' : 'w' })
      if (!res.body) { out.close(); throw new Error('无响应体') }
      const reader = res.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          if (!out.write(Buffer.from(value))) {
            await new Promise<void>((r) => out.once('drain', r))
          }
          received += value.length
          onProgress?.(Math.min(1, received / total))
        }
      }
      await new Promise<void>((resolve, reject) => { out.end(() => resolve()); out.on('error', reject) })
      if (received < 1000) throw new Error('下载内容过小')
      fs.renameSync(tmp, dest)
      return
    } catch (e: any) {
      lastErr = e
      console.warn(`[asr] 镜像 ${base} 下载 ${fileName} 失败:`, e?.message || e)
      // 换下一个镜像时保留 .part（可能可续传），继续尝试
    }
  }
  throw lastErr || new Error('所有镜像均下载失败')
}

/** 下载模型（模型 + 词表），进度推送到渲染层 */
export async function downloadModel(win?: Electron.BrowserWindow): Promise<{ ok: boolean; error?: string }> {
  const send = (phase: string, pct: number) => {
    win && !win.isDestroyed() && win.webContents.send('asr:progress', { phase, pct })
  }
  try {
    await downloadFile('tokens.txt', TOKENS_FILE(), (pct) => send('tokens', pct))
    await downloadFile('model.int8.onnx', MODEL_FILE(), (pct) => send('model', pct))
    // 新模型就绪后丢弃旧识别器，下次识别重新加载
    recognizer = null
    // 下载成功后清除"想下载"标记
    try { if (fs.existsSync(WANT_FILE())) fs.unlinkSync(WANT_FILE()) } catch {}
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

/** 安装时询问后写入标记；应用启动检测到此标记会自动下载模型 */
export function markModelWanted(): void {
  try {
    fs.mkdirSync(MODEL_DIR(), { recursive: true })
    fs.writeFileSync(WANT_FILE(), String(Date.now()), 'utf-8')
  } catch {}
}
export function consumeModelWanted(): boolean {
  try {
    if (!fs.existsSync(WANT_FILE())) return false
    fs.unlinkSync(WANT_FILE())
    return true
  } catch { return false }
}

export function deleteModel(): boolean {
  try {
    recognizer = null
    if (fs.existsSync(MODEL_FILE())) fs.unlinkSync(MODEL_FILE())
    if (fs.existsSync(TOKENS_FILE())) fs.unlinkSync(TOKENS_FILE())
    return true
  } catch { return false }
}

/** 创建离线识别器（懒加载，避免无模型时报错） */
let recognizer: any = null
function getRecognizer() {
  if (recognizer) return recognizer
  const st = modelStatus()
  if (!st.ready) throw new Error('模型未下载')
  const sherpa = require('sherpa-onnx')
  // 注意：tokens / numThreads / provider 必须放在 modelConfig 顶层，
  // 放到 senseVoice 子对象里会被底层忽略（等于没词表，识别结果永远为空）
  recognizer = sherpa.createOfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      senseVoice: {
        model: MODEL_FILE(),
        language: 'auto',
        useInverseTextNormalization: 1
      },
      tokens: TOKENS_FILE(),
      numThreads: 2,
      provider: 'cpu'
    }
  })
  return recognizer
}

/** 识别一段 16k 单声道 PCM（Float32Array）文本 */
export function recognize(pcm: Float32Array): string {
  if (!pcm || pcm.length < 1600) return ''
  const rec = getRecognizer()
  const stream = rec.createStream()
  // 接口是位置参数 acceptWaveform(sampleRate, samples)，传对象会直接抛异常
  stream.acceptWaveform(16000, pcm)
  rec.decode(stream)
  const text = (rec.getResult(stream)?.text || '').trim()
  try { stream.free?.() } catch { /* 忽略 */ }
  return text
}

/** 注册 IPC（在 setupIpc 中调用） */
export function registerAsrIpc(winRef: () => Electron.BrowserWindow | null) {
  ipcMain.handle('asr:status', () => modelStatus())
  ipcMain.handle('asr:download', async () => downloadModel(winRef() || undefined))
  ipcMain.handle('asr:mark-wanted', () => markModelWanted())
  ipcMain.handle('asr:delete', () => deleteModel())
  ipcMain.handle('asr:recognize', async (_e, samples: number[]) => {
    try { return recognize(new Float32Array(samples || [])) } catch (e: any) { return { error: e?.message || String(e) } }
  })
}
