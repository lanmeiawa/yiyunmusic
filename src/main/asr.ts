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
const BASE = 'https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main'
const MODEL_SIZE = 228 * 1024 * 1024 // 仅用于进度估算

export function modelStatus(): { ready: boolean; size: number; path: string } {
  try {
    const ok = fs.existsSync(MODEL_FILE()) && fs.existsSync(TOKENS_FILE()) && fs.statSync(MODEL_FILE()).size > 1000000
    return { ready: ok, size: ok ? fs.statSync(MODEL_FILE()).size : 0, path: MODEL_DIR() }
  } catch { return { ready: false, size: 0, path: MODEL_DIR() } }
}

/** 下载单个文件，带进度（0-1） */
async function downloadFile(url: string, dest: string, onProgress?: (pct: number) => void): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(0) as any })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length')) || MODEL_SIZE
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const tmp = dest + '.part'
  const out = fs.createWriteStream(tmp)
  let received = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      out.write(Buffer.from(value))
      received += value.length
      onProgress?.(Math.min(1, received / total))
    }
  }
  await new Promise<void>((resolve, reject) => { out.end(() => resolve()); out.on('error', reject) })
  fs.renameSync(tmp, dest)
}

/** 下载模型（模型 + 词表），进度推送到渲染层 */
export async function downloadModel(win?: Electron.BrowserWindow): Promise<{ ok: boolean; error?: string }> {
  try {
    await downloadFile(`${BASE}/model.int8.onnx`, MODEL_FILE(), (pct) => {
      win && !win.isDestroyed() && win.webContents.send('asr:progress', { phase: 'model', pct })
    })
    await downloadFile(`${BASE}/tokens.txt`, TOKENS_FILE(), (pct) => {
      win && !win.isDestroyed() && win.webContents.send('asr:progress', { phase: 'tokens', pct })
    })
    return { ok: true }
  } catch (e: any) {
    try { if (fs.existsSync(MODEL_FILE() + '.part')) fs.unlinkSync(MODEL_FILE() + '.part') } catch {}
    return { ok: false, error: e?.message || String(e) }
  }
}

export function deleteModel(): boolean {
  try {
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
  recognizer = sherpa.createOfflineRecognizer({
    modelConfig: {
      senseVoice: {
        model: MODEL_FILE(),
        tokens: TOKENS_FILE(),
        numThreads: 2,
        useInverseTextNormalization: true
      }
    }
  })
  return recognizer
}

/** 识别一段 16k 单声道 PCM（Float32Array）文本 */
export function recognize(pcm: Float32Array): string {
  const rec = getRecognizer()
  const stream = rec.createStream({ sampleRate: 16000 })
  stream.acceptWaveform({ samples: pcm, sampleRate: 16000 })
  rec.decode(stream)
  return (rec.getResult(stream)?.text || '').trim()
}

/** 注册 IPC（在 setupIpc 中调用） */
export function registerAsrIpc(winRef: () => Electron.BrowserWindow | null) {
  ipcMain.handle('asr:status', () => modelStatus())
  ipcMain.handle('asr:download', async () => downloadModel(winRef() || undefined))
  ipcMain.handle('asr:delete', () => deleteModel())
  ipcMain.handle('asr:recognize', async (_e, samples: number[]) => {
    try { return recognize(new Float32Array(samples || [])) } catch (e: any) { return { error: e?.message || String(e) } }
  })
}
