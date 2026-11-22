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
  const headers: Record<string, string> = { 'User-Agent': UA }
  if (!radio) headers.Referer = 'https://music.163.com'
  else headers['Icy-MetaData'] = '1' // 电台常要求 ICY 头，返回流信息
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
    res.setHeader('Content-Type', ct && /^audio\//.test(ct) ? ct : 'audio/mpeg')
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
