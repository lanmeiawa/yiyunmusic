import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

/**
 * 本地音频流代理
 *
 * 网易云音源为跨域资源，Web Audio 的 MediaElementAudioSourceNode 会因 CORS 污染而输出静音。
 * 这里在主进程开一个仅监听 127.0.0.1 的轻量 HTTP 服务，把音源/本地文件转成同源可分析流，
 * 同时支持 Range 请求（拖动进度条）与 CORS 响应头。音频始终以流方式转发，不落盘、不缓存整首歌。
 */

type Source = { target: string; local: boolean; time: number; radio?: boolean }
const sources = new Map<string, Source>()
let server: http.Server | null = null
let port = 0

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const AUDIO_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
  '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg'
}

function token(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function cleanup() {
  const now = Date.now()
  for (const [k, v] of sources) if (now - v.time > 30 * 60 * 1000) sources.delete(k)
}

/** 注册远程音源，返回本地代理 URL；失败返回空串（调用方降级直连） */
export async function registerAudioUrl(url: string, radio = false): Promise<string> {
  if (!/^https?:\/\//i.test(url || '')) return ''
  if (!server) return ''
  cleanup()
  const t = token()
  sources.set(t, { target: url, local: false, time: Date.now(), radio })
  return `http://127.0.0.1:${port}/a/${t}`
}

/** 注册本地音频文件，返回本地代理 URL */
export async function registerLocalAudio(filePath: string): Promise<string> {
  if (!filePath || !fs.existsSync(filePath) || !server) return ''
  cleanup()
  const t = token()
  sources.set(t, { target: path.resolve(filePath), local: true, time: Date.now() })
  return `http://127.0.0.1:${port}/a/${t}`
}

function commonHeaders(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Range')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Accept-Ranges', 'bytes')
}

async function serveRemote(req: http.IncomingMessage, res: http.ServerResponse, target: string, radio = false) {
  // 电台流不能带网易云的 Referer——很多网络电台会因此判定盗链并拒绝（403/拦截）
  // 也不能请求 Icy-MetaData：一旦开启，上游会在音频字节中插入元数据块，<audio> 会直接解不出来
  const headers: Record<string, string> = { 'User-Agent': UA }
  if (!radio) headers.Referer = 'https://music.163.com'
  if (req.headers.range) headers.Range = String(req.headers.range)
  const ctrl = new AbortController()
  const close = () => ctrl.abort()
  res.on('close', close)
  try {
    const upstream = await fetch(target, { headers, redirect: 'follow', signal: ctrl.signal })
    // 上游拒绝 Range（返回 200）时按完整流处理，赋值给 src 仍可播放，只是无法拖动
    const status = upstream.status === 206 ? 206 : 200
    res.statusCode = status
    const ct = upstream.headers.get('content-type')
    res.setHeader('Content-Type', ct && /^audio\/|^video\/|^application\/ogg|^application\/x-mpegurl|^application\/vnd\.apple/i.test(ct) ? ct : 'audio/mpeg')
    const len = upstream.headers.get('content-length')
    if (len) res.setHeader('Content-Length', len)
    const cr = upstream.headers.get('content-range')
    if (cr) res.setHeader('Content-Range', cr)
    if (!upstream.body) { res.end(); return }
    Readable.fromWeb(upstream.body as any).pipe(res)
  } catch (e: any) {
    if (!res.headersSent) {
      res.statusCode = 502
      res.end('audio proxy failed')
    } else {
      res.end()
    }
  } finally {
    res.off('close', close)
  }
}

/* ==================== HLS 代理 ==================== */
/**
 * 浏览器内核不能直接播放 HLS（m3u8），且跨域会让 hls.js 拿不到分片。
 * 这里把播放列表下载下来，把里面所有 URI 改写成走本地代理，从而：
 *   1) 播放列表与分片全部同源（CORS 不再是问题）
 *   2) 嵌套播放列表（master -> media）同样被代理
 */

function b64urlEncode(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url')
}
function b64urlDecode(s: string): string {
  try { return Buffer.from(s, 'base64url').toString('utf8') } catch { return '' }
}

/** 把一个远程 HLS 地址包装成本地代理地址（服务未启动时返回空串） */
export function hlsProxyUrl(url: string): string {
  if (!server || !/^https?:\/\//i.test(url || '')) return ''
  return `http://127.0.0.1:${port}/hls?u=${b64urlEncode(url)}`
}

function rewritePlaylist(text: string, baseUrl: string): string {
  const abs = (u: string) => {
    try { return new URL(u, baseUrl).toString() } catch { return u }
  }
  const wrap = (u: string) => `/hls?u=${b64urlEncode(abs(u))}`
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return line
      if (trimmed.startsWith('#')) {
        // #EXT-X-KEY:URI="..." / #EXT-X-MAP:URI="..." 等属性里的地址也要走代理
        return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${wrap(u)}"`)
      }
      return wrap(trimmed)
    })
    .join('\n')
}

async function serveHls(req: http.IncomingMessage, res: http.ServerResponse, target: string) {
  if (!/^https?:\/\//i.test(target)) { res.statusCode = 400; res.end('bad target'); return }
  const headers: Record<string, string> = { 'User-Agent': UA }
  if (req.headers.range) headers.Range = String(req.headers.range)
  const ctrl = new AbortController()
  const close = () => ctrl.abort()
  res.on('close', close)
  try {
    const upstream = await fetch(target, { headers, redirect: 'follow', signal: ctrl.signal })
    const ct = (upstream.headers.get('content-type') || '').toLowerCase()
    const looksM3u8 = /mpegurl|m3u8/.test(ct) || /\.m3u8(\?|$)/i.test(target)
    if (looksM3u8 && !req.headers.range) {
      const text = await upstream.text()
      if (!text.trimStart().startsWith('#EXTM3U')) {
        // 名义上是 m3u8，实际返回了别的（多为错误页）：原样返回，交给播放器报错
        res.statusCode = upstream.status === 200 ? 200 : upstream.status
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(text)
        return
      }
      const base = upstream.url || target
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
      res.end(rewritePlaylist(text, base))
      return
    }
    // 分片 / 密钥 / 非 HLS：直接透传
    const status = upstream.status === 206 ? 206 : 200
    res.statusCode = status
    res.setHeader('Content-Type', ct && /^audio\/|^video\/|^application\/(octet-stream|ogg|mp4)|^binary/.test(ct) ? ct : 'application/octet-stream')
    const len = upstream.headers.get('content-length')
    if (len) res.setHeader('Content-Length', len)
    const cr = upstream.headers.get('content-range')
    if (cr) res.setHeader('Content-Range', cr)
    if (!upstream.body) { res.end(); return }
    Readable.fromWeb(upstream.body as any).pipe(res)
  } catch {
    if (!res.headersSent) { res.statusCode = 502; res.end('hls proxy failed') } else res.end()
  } finally {
    res.off('close', close)
  }
}

/* ==================== 流探测 ==================== */
export type StreamProbe = {
  kind: 'hls' | 'audio' | 'dead'
  url: string
  contentType?: string
  status?: number
  error?: string
}

/** 解析 .pls / .m3u 播放列表文本，取出第一个可用地址 */
function parsePlaylist(text: string, base: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const isPls = /\[playlist\]/i.test(text)
  if (isPls) {
    for (const l of lines) {
      const m = /^File\d*\s*=\s*(.+)$/i.exec(l)
      if (m) { try { return new URL(m[1], base).toString() } catch { return m[1] } }
    }
    return ''
  }
  for (const l of lines) {
    if (!l || l.startsWith('#')) continue
    try { return new URL(l, base).toString() } catch { return l }
  }
  return ''
}

/**
 * 探测一个电台地址到底是什么：
 * - hls：返回 m3u8 播放列表
 * - audio：可直接喂给 <audio> 的音频流（含从 .pls/.m3u 里解析出的真实地址）
 * - dead：连不上 / 明确错误
 */
export async function probeStream(url: string, depth = 0): Promise<StreamProbe> {
  if (!/^https?:\/\//i.test(url || '')) return { kind: 'dead', url, error: '无效地址' }
  if (/\.m3u8(\?|$)/i.test(url)) return { kind: 'hls', url }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 9000)
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Range: 'bytes=0-4095' },
      redirect: 'follow',
      signal: ctrl.signal
    })
    const ct = (r.headers.get('content-type') || '').toLowerCase()
    if (!r.ok && r.status !== 206) return { kind: 'dead', url, status: r.status, contentType: ct }
    // 分片/音频直接判定
    if (/^audio\/|^video\//.test(ct) || /octet-stream/.test(ct)) {
      // 有些服务器对音频返回 text/plain，这里再看一眼内容
      return { kind: 'audio', url, status: r.status, contentType: ct }
    }
    let head = ''
    if (r.body) {
      const reader = r.body.getReader()
      const { value } = await reader.read()
      head = value ? Buffer.from(value).toString('utf8') : ''
      try { await reader.cancel() } catch {}
    }
    if (head.includes('#EXTM3U')) return { kind: 'hls', url, status: r.status, contentType: ct }
    if (/mpegurl|m3u8/.test(ct)) return { kind: 'hls', url, status: r.status, contentType: ct }
    if (/\[playlist\]|#EXTINF/i.test(head) || /\.(pls|m3u)(\?|$)/i.test(url)) {
      const inner = parsePlaylist(head, r.url || url)
      if (inner && inner !== url && depth < 2) return probeStream(inner, depth + 1)
      return { kind: 'dead', url, error: '播放列表无法解析' }
    }
    if (/^audio\/|^application\/ogg/.test(ct)) return { kind: 'audio', url, status: r.status, contentType: ct }
    return { kind: 'dead', url, status: r.status, contentType: ct, error: '不支持的流类型' }
  } catch (e: any) {
    return { kind: 'dead', url, error: e?.name === 'AbortError' ? '连接超时' : (e?.message || String(e)) }
  } finally {
    clearTimeout(timer)
  }
}

function serveLocal(req: http.IncomingMessage, res: http.ServerResponse, file: string) {
  try {
    const stat = fs.statSync(file)
    const type = AUDIO_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'
    res.setHeader('Content-Type', type)
    const range = req.headers.range ? /bytes=(\d*)-(\d*)/.exec(String(req.headers.range)) : null
    let start = 0
    let end = stat.size - 1
    if (range) {
      if (range[1]) start = Number(range[1])
      if (range[2]) end = Number(range[2])
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
        res.statusCode = 416
        res.setHeader('Content-Range', `bytes */${stat.size}`)
        res.end()
        return
      }
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
    }
    res.setHeader('Content-Length', end - start + 1)
    fs.createReadStream(file, { start, end }).pipe(res)
  } catch {
    res.statusCode = 404
    res.end('not found')
  }
}

export function startAudioProxy(): void {
  if (server) return
  server = http.createServer((req, res) => {
    commonHeaders(res)
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1')
    if (reqUrl.pathname === '/hls') {
      const target = b64urlDecode(reqUrl.searchParams.get('u') || '')
      if (!target) { res.statusCode = 400; res.end('missing u'); return }
      void serveHls(req, res, target)
      return
    }
    const m = /^\/a\/([A-Za-z0-9]+)$/.exec(req.url || '')
    const src = m ? sources.get(m[1]) : null
    if (!src) { res.statusCode = 404; res.end('unknown token'); return }
    if (src.local) serveLocal(req, res, src.target)
    else void serveRemote(req, res, src.target, !!src.radio)
  })
  server.on('clientError', (_e, socket) => socket.destroy())
  server.listen(0, '127.0.0.1', () => {
    const addr = server?.address()
    port = addr && typeof addr === 'object' ? addr.port : 0
  })
}

export function stopAudioProxy(): void {
  sources.clear()
  server?.close()
  server = null
}
