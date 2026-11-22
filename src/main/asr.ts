/**
 * 本地语音转文本（离线，无需网络）
 * 引擎：sherpa-onnx（WASM，Apache-2.0）
 *
 * 支持多个模型，用户可在设置里选择、下载、删除：
 *   - paraformer-zh    中文专用（Paraformer，中文最准，无标点）
 *   - sensevoice       通用多语种（中英日韩粤，自动标点）
 *   - paraformer-small 轻量快速（体积最小、速度最快）
 *
 * 目录：userData/asr-models/<modelId>/{model.int8.onnx, tokens.txt}
 * 当前启用：userData/asr-models/active.json
 * 旧版本模型在 userData/asr-model/，首次运行自动迁移为 sensevoice。
 */
import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain } from 'electron'

export type AsrModelId = 'paraformer-zh' | 'sensevoice' | 'paraformer-small'

type ModelDef = {
  id: AsrModelId
  name: string
  tag: string
  desc: string
  repo: string
  kind: 'paraformer' | 'sensevoice'
  approxMB: number
}

const MODEL_LIST: ModelDef[] = [
  {
    id: 'paraformer-zh',
    name: '中文专用',
    tag: '中文最准',
    desc: 'Paraformer 中文模型，新闻、播客、访谈识别更准；输出不带标点。',
    repo: 'csukuangfj/sherpa-onnx-paraformer-zh-2023-09-14',
    kind: 'paraformer',
    approxMB: 232
  },
  {
    id: 'sensevoice',
    name: '通用多语种',
    tag: '带标点',
    desc: 'SenseVoice 多语种模型，中英日韩粤混说也能识别，自动补标点。',
    repo: 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17',
    kind: 'sensevoice',
    approxMB: 228
  },
  {
    id: 'paraformer-small',
    name: '轻量快速',
    tag: '响应最快',
    desc: '体积仅 78MB，解码速度约为大模型 4 倍，适合低配电脑；中文精度略低。',
    repo: 'csukuangfj/sherpa-onnx-paraformer-zh-small-2024-03-09',
    kind: 'paraformer',
    approxMB: 78
  }
]

const MIRRORS = [
  'https://hf-mirror.com',
  'https://huggingface.co'
]
const FILE_MODEL = 'model.int8.onnx'
const FILE_TOKENS = 'tokens.txt'

const ROOT = () => path.join(app.getPath('userData'), 'asr-models')
const LEGACY = () => path.join(app.getPath('userData'), 'asr-model')
const DIR = (id: AsrModelId) => path.join(ROOT(), id)
const MODEL_FILE = (id: AsrModelId) => path.join(DIR(id), FILE_MODEL)
const TOKENS_FILE = (id: AsrModelId) => path.join(DIR(id), FILE_TOKENS)
const ACTIVE_FILE = () => path.join(ROOT(), 'active.json')
const WANT_FILE = () => path.join(ROOT(), 'wanted')

function ensureRoot() {
  try { fs.mkdirSync(ROOT(), { recursive: true }) } catch { /* 忽略 */ }
}

/** 旧版单模型目录迁移为 sensevoice（只做一次，失败静默） */
let migrated = false
function migrateLegacy() {
  if (migrated) return
  migrated = true
  try {
    const src = path.join(LEGACY(), FILE_MODEL)
    const dst = MODEL_FILE('sensevoice')
    if (!fs.existsSync(src) || fs.existsSync(dst)) return
    ensureRoot()
    fs.mkdirSync(DIR('sensevoice'), { recursive: true })
    fs.renameSync(src, dst)
    const tok = path.join(LEGACY(), FILE_TOKENS)
    if (fs.existsSync(tok)) fs.renameSync(tok, TOKENS_FILE('sensevoice'))
    if (!readActive()) writeActive('sensevoice')
    console.log('[asr] 旧模型已迁移为 sensevoice')
  } catch (e: any) {
    console.warn('[asr] 旧模型迁移失败:', e?.message || e)
  }
}

function readActive(): AsrModelId | '' {
  try {
    const raw = fs.readFileSync(ACTIVE_FILE(), 'utf-8')
    const id = JSON.parse(raw)?.id
    if (MODEL_LIST.some((m) => m.id === id)) return id as AsrModelId
  } catch { /* 忽略 */ }
  return ''
}
function writeActive(id: AsrModelId) {
  ensureRoot()
  try { fs.writeFileSync(ACTIVE_FILE(), JSON.stringify({ id }), 'utf-8') } catch { /* 忽略 */ }
}

function isReady(id: AsrModelId): boolean {
  try {
    return fs.existsSync(MODEL_FILE(id)) && fs.existsSync(TOKENS_FILE(id)) && fs.statSync(MODEL_FILE(id)).size > 1000000
  } catch { return false }
}

function sizeOf(id: AsrModelId): number {
  try { return fs.statSync(MODEL_FILE(id)).size } catch { return 0 }
}

/** 当前启用的模型：优先 active.json，否则用第一个已下载的 */
export function activeModelId(): AsrModelId | '' {
  migrateLegacy()
  const active = readActive()
  if (active && isReady(active)) return active
  const fallback = MODEL_LIST.find((m) => isReady(m.id))
  if (fallback) { writeActive(fallback.id); return fallback.id }
  return ''
}

export function modelStatus(): { ready: boolean; size: number; path: string; modelId: AsrModelId | ''; name: string } {
  const id = activeModelId()
  if (!id) return { ready: false, size: 0, path: DIR('sensevoice'), modelId: '', name: '' }
  const def = MODEL_LIST.find((m) => m.id === id)
  return { ready: true, size: sizeOf(id), path: DIR(id), modelId: id, name: def?.name || id }
}

/** 模型列表（含下载状态），供设置页展示 */
export function listModels() {
  migrateLegacy()
  const active = activeModelId()
  return MODEL_LIST.map((m) => ({
    id: m.id,
    name: m.name,
    tag: m.tag,
    desc: m.desc,
    approxMB: m.approxMB,
    kind: m.kind,
    ready: isReady(m.id),
    size: sizeOf(m.id),
    active: active === m.id,
    downloading: downloadingId === m.id
  }))
}

/* ==================== 下载 ==================== */

let downloadingId: AsrModelId | '' = ''
let winRef: () => Electron.BrowserWindow | null = () => null

function progress(modelId: AsrModelId, phase: string, pct: number) {
  try {
    const win = winRef()
    if (win && !win.isDestroyed()) win.webContents.send('asr:progress', { modelId, phase, pct })
  } catch { /* 忽略 */ }
}

/** 下载单个文件：多镜像 + 断点续传 + 进度 */
async function downloadFile(
  repo: string,
  fileName: string,
  dest: string,
  onProgress: (pct: number) => void
): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const tmp = dest + '.part'
  let lastErr: any
  for (const mirror of MIRRORS) {
    try {
      const existing = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0
      const headers: Record<string, string> = existing > 0 ? { Range: `bytes=${existing}-` } : {}
      const url = `${mirror}/${repo}/resolve/main/${fileName}`
      const res = await fetch(url, { headers, redirect: 'follow' })
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
      const append = res.status === 206 && existing > 0
      const total = (Number(res.headers.get('content-length')) || 0) + (append ? existing : 0)
      let received = append ? existing : 0
      const out = fs.createWriteStream(tmp, { flags: append ? 'a' : 'w' })
      if (!res.body) { out.close(); throw new Error('无响应体') }
      const reader = res.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          if (!out.write(Buffer.from(value))) await new Promise<void>((r) => out.once('drain', r))
          received += value.length
          if (total > 0) onProgress(Math.min(1, received / total))
        }
      }
      await new Promise<void>((resolve, reject) => { out.end(() => resolve()); out.on('error', reject) })
      if (received < 1000) throw new Error('下载内容过小')
      fs.renameSync(tmp, dest)
      return
    } catch (e: any) {
      lastErr = e
      console.warn(`[asr] ${mirror} 下载 ${fileName} 失败:`, e?.message || e)
    }
  }
  throw lastErr || new Error('所有镜像均下载失败')
}

/** 下载并在需要时设为当前模型 */
export async function downloadModel(
  win?: Electron.BrowserWindow,
  modelId?: AsrModelId | string
): Promise<{ ok: boolean; error?: string; modelId?: AsrModelId }> {
  if (win) winRef = () => win
  migrateLegacy()
  const id = (MODEL_LIST.some((m) => m.id === modelId) ? modelId : 'paraformer-zh') as AsrModelId
  if (downloadingId) return { ok: false, error: '已有模型正在下载，请稍候' }
  const def = MODEL_LIST.find((m) => m.id === id)!
  downloadingId = id
  try {
    progress(id, 'tokens', 0)
    await downloadFile(def.repo, FILE_TOKENS, TOKENS_FILE(id), (pct) => progress(id, 'tokens', pct))
    await downloadFile(def.repo, FILE_MODEL, MODEL_FILE(id), (pct) => progress(id, 'model', pct))
    // 下载完成即切换为该模型（用户点下载通常就是想用它）
    dropRecognizer()
    writeActive(id)
    try { if (fs.existsSync(WANT_FILE())) fs.unlinkSync(WANT_FILE()) } catch { /* 忽略 */ }
    progress(id, 'done', 1)
    return { ok: true, modelId: id }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e), modelId: id }
  } finally {
    downloadingId = ''
  }
}

/** 安装时询问后写入标记；首次启动自动下载推荐模型 */
export function markModelWanted(id: AsrModelId = 'paraformer-zh'): void {
  ensureRoot()
  try { fs.writeFileSync(WANT_FILE(), id, 'utf-8') } catch { /* 忽略 */ }
}

export function consumeModelWanted(): AsrModelId | '' {
  // 兼容旧版安装器写在 asr-model/wanted 的标记
  const candidates = [WANT_FILE(), path.join(LEGACY(), 'wanted')]
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue
      const raw = fs.readFileSync(file, 'utf-8').trim()
      fs.unlinkSync(file)
      return (MODEL_LIST.some((m) => m.id === raw) ? raw : 'paraformer-zh') as AsrModelId
    } catch { /* 继续下一个 */ }
  }
  return ''
}

export function deleteModel(modelId?: string): boolean {
  migrateLegacy()
  // 指定了 id 就必须精确匹配，绝不回退到"当前模型"（否则可能误删用户正在用的模型）
  const id: AsrModelId | '' = modelId
    ? (MODEL_LIST.some((m) => m.id === modelId) ? (modelId as AsrModelId) : '')
    : activeModelId()
  if (!id) return false
  try {
    for (const f of [MODEL_FILE(id), TOKENS_FILE(id), MODEL_FILE(id) + '.part']) {
      if (fs.existsSync(f)) fs.unlinkSync(f)
    }
    if (readActive() === id) {
      const next = MODEL_LIST.find((m) => m.id !== id && isReady(m.id))
      if (next) writeActive(next.id)
      else try { fs.unlinkSync(ACTIVE_FILE()) } catch { /* 忽略 */ }
    }
    dropRecognizer()
    return true
  } catch { return false }
}

export function setActiveModel(modelId: string): boolean {
  migrateLegacy()
  if (!MODEL_LIST.some((m) => m.id === modelId) || !isReady(modelId as AsrModelId)) return false
  writeActive(modelId as AsrModelId)
  dropRecognizer()
  return true
}

/* ==================== 识别 ==================== */

let recognizer: any = null
let recognizerModel: AsrModelId | '' = ''
/** 释放旧识别器：WASM 不会自动回收，切换模型时必须显式 free，否则内存会一直涨 */
function dropRecognizer() {
  try { recognizer?.free?.() } catch { /* 忽略 */ }
  recognizer = null
  recognizerModel = ''
}

function getRecognizer() {
  const id = activeModelId()
  if (!id) throw new Error('尚未下载语音模型')
  if (recognizer && recognizerModel === id) return recognizer
  const def = MODEL_LIST.find((m) => m.id === id)!
  const sherpa = require('sherpa-onnx')
  // 注意：tokens / numThreads / provider 必须在 modelConfig 顶层（放到子对象里会被忽略）
  const base = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      tokens: TOKENS_FILE(id),
      numThreads: 2,
      provider: 'cpu'
    } as any
  }
  if (def.kind === 'paraformer') {
    base.modelConfig.paraformer = { model: MODEL_FILE(id) }
  } else {
    base.modelConfig.senseVoice = {
      model: MODEL_FILE(id),
      language: 'auto',
      useInverseTextNormalization: 1
    }
  }
  recognizer = sherpa.createOfflineRecognizer(base)
  recognizerModel = id
  return recognizer
}

/** 识别一段 16k 单声道 PCM（Float32Array）文本 */
export function recognize(pcm: Float32Array): string {
  if (!pcm || pcm.length < 1600) return ''
  const rec = getRecognizer()
  const stream = rec.createStream()
  // 位置参数：acceptWaveform(sampleRate, samples)
  stream.acceptWaveform(16000, pcm)
  rec.decode(stream)
  const text = (rec.getResult(stream)?.text || '').trim()
  try { stream.free?.() } catch { /* 忽略 */ }
  return text
}

/** 注册 IPC（在 setupIpc 中调用） */
export function registerAsrIpc(windowRef: () => Electron.BrowserWindow | null) {
  winRef = windowRef
  ipcMain.handle('asr:models', () => listModels())
  ipcMain.handle('asr:status', () => modelStatus())
  ipcMain.handle('asr:set-model', (_e, id: string) => setActiveModel(id))
  ipcMain.handle('asr:download', async (_e, id?: string) => downloadModel(winRef() || undefined, id))
  ipcMain.handle('asr:mark-wanted', (_e, id?: string) => markModelWanted((id as AsrModelId) || undefined))
  ipcMain.handle('asr:delete', (_e, id?: string) => deleteModel(id))
  ipcMain.handle('asr:recognize', async (_e, samples: number[]) => {
    try { return recognize(new Float32Array(samples || [])) } catch (e: any) { return { error: e?.message || String(e) } }
  })
}
