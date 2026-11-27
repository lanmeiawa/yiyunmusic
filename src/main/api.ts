import { getCookie, mergeCookie, setCookie, setProfile, pushHistory, upsertAccount, getAccounts, setActiveAccountId, getStore } from './store'

type ApiFn = (params: Record<string, any>) => Promise<any>

/**
 * 接口库内部有上百个模块，首次 require 约 500ms。
 * 之前写在模块顶层，等于每次启动都先花半秒把用不到的接口也加载一遍；
 * 改为首次调用时再加载，启动阶段完全不碰它。
 */
let ncmModule: any = null
function loadNcm(): any {
  if (!ncmModule) ncmModule = require('NeteaseCloudMusicApi')
  return ncmModule
}

let apiMapCache: Record<string, ApiFn> | null = null

/** 接口名 → 实现。首次真正调用接口时才构建，避免拖慢启动。 */
function getApiMap(): Record<string, ApiFn> {
  if (!apiMapCache) {
    const m = loadNcm()
    apiMapCache = {
      login_qr_key: m.login_qr_key,
      login_qr_create: m.login_qr_create,
      login_qr_check: m.login_qr_check,
      login_status: m.login_status,
      logout: m.logout,
      user_playlist: m.user_playlist,
      playlist_detail: m.playlist_detail,
      song_detail: m.song_detail,
      song_url_v1: m.song_url_v1,
      song_url: m.song_url,
      lyric: m.lyric,
      check_music: m.check_music,
      search: m.search,
      user_detail: m.user_detail,
      user_record: m.user_record,
      user_level: m.user_level,
      vip_info: m.vip_info,
      user_account: m.user_account,
      recommend_songs: m.recommend_songs,
      personalized_newsong: m.personalized_newsong,
      personalized: m.personalized,
      top_album: m.top_album,
      album: m.album,
      artist_top_song: m.artist_top_song,
      like: m.like,
      playlist_create: m.playlist_create,
      playlist_delete: m.playlist_delete,
      playlist_tracks: m.playlist_tracks,
      personal_fm: m.personal_fm,
      dj_hot: m.dj_hot,
      dj_program: m.dj_program,
      dj_program_toplist: m.dj_program_toplist,
      dj_category_recommend: m.dj_category_recommend,
      dj_recommend: m.dj_recommend,
      comment: m.comment,
      toplist: m.toplist,
      search_hot_detail: m.search_hot_detail,
      search_suggest: m.search_suggest,
      cloudsearch: m.cloudsearch,
      comment_hot: m.comment_hot,
      comment_music: m.comment_music
    }
  }
  return apiMapCache
}

/** 预热：窗口显示后调用，把 500ms 的加载挪到用户已经在看界面的时刻 */
export function warmupApi(): void {
  try { getApiMap() } catch (e: any) { console.warn('[api] 接口库预热失败:', e?.message || e) }
}

/**
 * 参数规范化：修正已知的接口参数名/类型陷阱，让调用方无论传参习惯如何都能命中正确接口。
 */
function normalizeParams(name: string, params: Record<string, any>): Record<string, any> {
  const p: Record<string, any> = { ...params }
  switch (name) {
    case 'playlist_tracks':
      // 接口实际用 pid（歌单 id），前端历史遗留用了 id，这里兜底纠正
      if (p.pid === undefined && p.id !== undefined) { p.pid = p.id; delete p.id }
      // tracks 需要是逗号分隔字符串
      if (Array.isArray(p.tracks)) p.tracks = p.tracks.join(',')
      else if (p.tracks !== undefined) p.tracks = String(p.tracks)
      break
    case 'like':
      // like.js 只识别字符串 'false'，boolean false 会被误判成 true，这里转成字符串
      if (p.like === true) p.like = 'true'
      else if (p.like === false) p.like = 'false'
      break
  }
  return p
}

/** 是否可安全重试：仅对网络/超时类错误重试；业务错误（参数错、未登录、不存在等）不重试 */
function isRetryable(e: any): boolean {
  const msg = String(e?.body?.msg || e?.body?.message || e?.message || e?.code || '')
  // terminated / premature close：连接被对端提前关闭（fetch/undici 的典型报错），重试通常能成功
  return /timeout|timed out|network error|econnreset|econnrefused|enotfound|eai_again|socket hang up|aborted|exceeded|connect|terminated|premature|other side closed|body stream/i.test(msg)
}

/** 网易云的限频错误（code 405 / 操作频繁） */
function isRateLimited(e: any): boolean {
  const code = e?.body?.code ?? e?.code
  const msg = String(e?.body?.message || e?.body?.msg || e?.message || '')
  return code === 405 || /操作频繁|请求过于频繁|too many requests|rate limit/i.test(msg)
}

/** 搜索类请求最小间隔：并发/连发会直接被判「操作频繁」 */
let lastSearchAt = 0
async function throttleSearch(minGap = 320) {
  const wait = lastSearchAt + minGap - Date.now()
  if (wait > 0) await sleep(wait)
  lastSearchAt = Date.now()
}

const DEFAULT_TIMEOUT = 15000
const RETRY_LIMIT = 2

/**
 * 多线路保险（第一层）：按请求指定官方入口，网络层失败时依次换线路重试。
 * 库本身把域名在加载时就固化了，不能再改全局配置；但 createOption() 支持
 * 用 domain 参数覆盖（只允许 *.163.com），所以这里逐请求切换。
 * 三个域名实测搜索 / 歌词 / 音源都能正常返回。
 */
const HOSTS = [
  'https://interface.music.163.com',
  'https://interface3.music.163.com',
  'https://music.163.com'
]
/** 最近一次成功的线路（5 分钟内复用） */
let preferredHost = ''
let preferredUntil = 0

/**
 * 多线路保险（第二层）：自建/自部署的 NeteaseCloudMusicApi 服务。
 * 内置库彻底失效（例如网易云改了加密、库版本落后）时，直接把同样的调用转到这个地址。
 * 路由规则与服务端一致：文件名下划线转斜杠，例：song_url_v1 → /song/url/v1。
 */
const SPECIAL_ROUTES: Record<string, string> = {
  daily_signin: '/daily_signin',
  fm_trash: '/fm_trash',
  personal_fm: '/personal_fm'
}
function backupBase(): string {
  const raw = String(getStore().customization.apiBackupUrl || '').trim()
  if (!/^https?:\/\/[^\s]+$/i.test(raw)) return ''
  return raw.replace(/\/+$/, '')
}
function backupRoute(name: string): string {
  return SPECIAL_ROUTES[name] || '/' + name.replace(/_/g, '/')
}
function isServerSideError(e: any): boolean {
  const status = Number(e?.status || e?.response?.status || 0)
  return status >= 500
}

/** 走备用服务调用同一接口，返回结构（body）与内置一致 */
async function callViaBackup(name: string, params: Record<string, any>): Promise<any> {
  const base = backupBase()
  if (!base) throw new Error('未配置备用接口地址')
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || k === 'timeout' || k === 'domain') continue
    qs.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  }
  const cookie = getCookie()
  if (cookie && !qs.has('cookie')) qs.set('cookie', cookie)
  const res = await fetch(`${base}${backupRoute(name)}?${qs.toString()}`, {
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT)
  })
  const text = await res.text()
  let body: any
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`备用接口返回异常（HTTP ${res.status}）`)
  }
  if (!res.ok && body?.code === undefined) throw new Error(`备用接口 HTTP ${res.status}`)
  return body
}

/** 线路体检：内置线路 + 备用线路各打一次搜索接口 */
export async function checkApiHealth(): Promise<any> {
  const out: any = {
    builtin: { ok: false, ms: 0, error: '', lines: HOSTS.length },
    backup: { ok: false, ms: 0, error: '', url: backupBase() }
  }
  const t0 = Date.now()
  try {
    const fn = getApiMap()['cloudsearch']
    let via = ''
    for (let i = 0; i < HOSTS.length; i++) {
      const params: any = { keywords: 'yiyun', type: 1, limit: 1, offset: 0, cookie: getCookie(), timeout: 8000 }
      if (i > 0) params.domain = HOSTS[i]
      try {
        const res: any = await fn(params)
        const body = res?.body ?? res
        if (body?.code === 200 || Array.isArray(body?.result?.songs)) { via = i === 0 ? '默认' : `线路 ${i + 1}`; break }
      } catch { /* 试下一条 */ }
    }
    out.builtin.ok = !!via
    out.builtin.via = via
    out.builtin.error = via ? '' : '三条线路都不通'
  } catch (e: any) {
    out.builtin.error = e?.body?.message || e?.message || '连接失败'
  }
  out.builtin.ms = Date.now() - t0

  if (!out.backup.url) return out
  const t1 = Date.now()
  try {
    const body = await callViaBackup('cloudsearch', { keywords: 'yiyun', type: 1, limit: 1, offset: 0 })
    out.backup.ok = body?.code === 200 || Array.isArray(body?.result?.songs)
    out.backup.error = out.backup.ok ? '' : body?.message || `code=${body?.code}`
  } catch (e: any) {
    out.backup.error = e?.message || '连接失败'
  }
  out.backup.ms = Date.now() - t1
  return out
}

/**
 * 统一调用网易云接口（带兜底）：
 * - 参数规范化（修正 pid / like 等已知陷阱）
 * - 自动注入当前 cookie（登录态）
 * - 自动把接口返回的 Set-Cookie 合并进本地 cookie
 * - 默认 15s 超时；网络层错误自动重试（指数退避，最多 2 次）
 * - 统一返回 body（含 code），失败时抛出带 code/message 的结构化错误
 */
export async function callApi(name: string, params: Record<string, any> = {}): Promise<any> {
  const fn = getApiMap()[name]
  if (!fn) throw new Error(`未知接口: ${name}`)

  // 搜索类接口统一节流，避免并发/连发被判定「操作频繁」
  if (/^(search|cloudsearch|search_suggest)/.test(name)) await throttleSearch()
  const merged = normalizeParams(name, params)
  const cookie = getCookie()
  if (cookie && merged.cookie === undefined) merged.cookie = cookie
  if (merged.timeout === undefined) merged.timeout = DEFAULT_TIMEOUT

  // 记住最近一次成功的线路，5 分钟内优先用它，避免每个请求都先撞一次坏线路
  const prefDomain = preferredHost && Date.now() < preferredUntil ? preferredHost : ''
  if (!prefDomain) preferredHost = ''
  if (merged.domain === undefined && prefDomain) merged.domain = prefDomain

  let lastErr: any
  let rotations = prefDomain ? Math.max(0, HOSTS.indexOf(prefDomain)) : 0
  for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
    try {
      const res: any = await fn(merged)
      // 合并 cookie（登录相关接口会返回新 cookie）
      if (res?.cookie) {
        const next = mergeCookie(getCookie(), res.cookie)
        if (next && next !== getCookie()) setCookie(next)
      }
      if (merged.domain) {
        preferredHost = merged.domain
        preferredUntil = Date.now() + 300000
      } else {
        preferredHost = ''
        preferredUntil = 0
      }
      return res?.body ?? res
    } catch (e: any) {
      lastErr = e
      // 被判定「操作频繁」时不要继续重试（越试越糟），记一个冷却时间直接失败
      if (isRateLimited(e)) {
        rateLimitedUntil = Date.now() + 20000
        break
      }
      const netish = isRetryable(e)
      // 第一层保险：网络层失败时换官方入口重试（逐请求指定，不动全局配置）
      if (netish && rotations < HOSTS.length - 1) {
        merged.domain = HOSTS[++rotations]
        console.warn(`[api] ${name} 网络失败，切换线路 ${rotations + 1}/${HOSTS.length}：${merged.domain}`)
        continue
      }
      if (attempt >= RETRY_LIMIT || !netish) break
      console.warn(`[api] ${name} 调用失败，第 ${attempt + 1} 次重试:`, e?.body?.message || e?.body?.msg || e?.message || e)
      await sleep(400 * (attempt + 1))
    }
  }

  // 第二层保险：内置线路全都不通时，交给备用接口服务
  if ((isRetryable(lastErr) || isServerSideError(lastErr)) && backupBase()) {
    try {
      const body = await callViaBackup(name, merged)
      if (body?.cookie) {
        const next = mergeCookie(getCookie(), body.cookie)
        if (next && next !== getCookie()) setCookie(next)
      }
      console.warn(`[api] ${name} 内置线路失败，已通过备用接口完成`)
      return body
    } catch (e: any) {
      console.warn('[api] 备用接口同样失败:', e?.message || e)
    }
  }

  const msg = lastErr?.body?.message || lastErr?.body?.msg || lastErr?.message || String(lastErr)
  console.error(`[api] ${name} 调用失败:`, msg)
  // 统一抛出结构化错误，前端可读取 code / message / body
  const err: any = new Error(msg)
  err.code = lastErr?.body?.code ?? lastErr?.status ?? lastErr?.code
  err.body = lastErr?.body ?? { code: err.code, message: msg }
  throw err
}

/**
 * 私人 FM 批量拉取
 * 接口每次只返回 3 首，limit 参数无效；并发请求会拿到同一批歌曲，
 * 因此这里串行多次请求，按 id 去重后返回。
 */
export async function fetchFmBatch(limit = 50): Promise<any[]> {
  const want = Math.max(1, Math.min(100, limit))
  const out: any[] = []
  const seen = new Set<number>()
  const maxCalls = Math.ceil(want / 3) + 8
  let emptyStreak = 0
  for (let i = 0; i < maxCalls && out.length < want; i++) {
    let list: any[] = []
    try {
      const res = await callApi('personal_fm')
      list = Array.isArray(res?.data) ? res.data : []
    } catch (e) {
      if (!out.length) throw e
      break
    }
    let added = 0
    for (const t of list) {
      if (!t?.id || seen.has(t.id)) continue
      seen.add(t.id)
      out.push(t)
      added++
      if (out.length >= want) break
    }
    emptyStreak = added === 0 ? emptyStreak + 1 : 0
    if (emptyStreak >= 3) break
  }
  return out
}

/** 扫码登录：第一步，获取 unikey */
export async function qrLoginKey() {
  const body = await callApi('login_qr_key')
  // login_qr_key 返回 body.data = { data: { unikey } } 结构
  const key = body?.data?.unikey || body?.data?.data?.unikey || body?.unikey || body?.newunikey
  return { key }
}

/** 扫码登录：第二步，生成二维码图片（data URL） */
export async function qrLoginCreate(key: string) {
  const body = await callApi('login_qr_create', { key, qrimg: true })
  return { qrimg: body?.data?.qrimg || body?.qrimg || body?.qrimgBase64 || '', data: body?.data }
}

/**
 * 扫码登录：第三步，轮询扫码结果
 * code: 800 过期 / 801 等待扫码 / 802 待确认 / 803 授权成功(返回cookie)
 */
export async function qrLoginCheck(key: string) {
  const body = await callApi('login_qr_check', { key })
  // 该接口 body.cookie 是分号连接的字符串，callApi 已自动合并入库
  if (body?.code === 803) {
    await refreshProfile()
  }
  return { code: body?.code, message: body?.message, cookie: getCookie() }
}

/** 获取当前登录用户资料 */
export async function refreshProfile() {
  const body = await callApi('login_status')
  if (body?.data?.profile) {
    const p = body.data.profile
    setProfile({
      userId: p.userId,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl,
      vipType: p.vipType ?? 0,
      vipLevel: p.vipDetail?.level
    })
    // 多账号：登录/刷新成功后保存该账号，便于之后直接切换
    upsertAccount({
      userId: p.userId,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl,
      vipType: p.vipType ?? 0
    })
    return getProfile()
  }
  setProfile(null)
  return null
}

/** 切换已保存账号：替换 cookie 并刷新资料；cookie 失效时返回 expired */
export async function switchAccount(id: string) {
  const acc = getAccounts().find((a) => a.id === id)
  if (!acc) return { ok: false, reason: 'missing' as const, profile: null }
  setCookie(acc.cookie)
  const profile = await refreshProfile()
  if (!profile) return { ok: false, reason: 'expired' as const, profile: null }
  setActiveAccountId(id)
  return { ok: true, reason: '' as const, profile }
}

import { getStore } from './store'
function getProfile() {
  return getStore().profile
}

/** 退出登录 */
export async function doLogout() {
  try {
    await callApi('logout')
  } catch {
    /* 忽略退出接口错误 */
  }
}

/** 获取歌曲播放地址（带会员 cookie，v1 接口可指定音质） */
export async function getSongUrl(id: number, level: string = 'exhigh') {
  let body: any
  try {
    body = await callApi('song_url_v1', { id, level })
  } catch (e: any) {
    // 网易云偶尔对未知 IP 触发风控（-460），降级用 song_url 再试一次
    console.warn('[songUrl] v1 失败，尝试降级接口:', e?.message || e)
    try {
      body = await callApi('song_url', { id })
    } catch {
      throw new Error('播放地址获取失败，可能是网络环境被网易云临时限制，请稍后重试')
    }
  }

  const data = body?.data?.[0]
  if (!data || !data.url) {
    return { id, url: '', unavailable: true, reason: body?.message || '该歌曲暂无可用音源' }
  }
  pushHistory(id)
  return {
    id,
    url: data.url,
    level: data.level,
    br: data.br,
    type: data.type,
    size: data.size,
    fee: data.fee,
    freeTrialInfo: data.freeTrialInfo || null,
    payed: !!data.payed
  }
}

export interface QualityProbe {
  /** 请求的音质等级 */
  level: string
  /** 接口实际返回的等级（可能低于请求等级） */
  actualLevel: string
  available: boolean
  url?: string
  br?: number
  type?: string
  size?: number
  fee?: number
  payed?: boolean
  trial?: boolean
}

export interface QualityResult {
  probes: QualityProbe[]
  error?: string
}

const QUALITY_LEVELS = ['standard', 'higher', 'exhigh', 'lossless', 'hires']
const qualityCache = new Map<number, { at: number; data: QualityResult }>()
const QUALITY_TTL = 3 * 60 * 1000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 实时探测一首歌实际可用的音质：
 * 串行逐级请求 v1 接口（并发容易被网易云判定为风险流量），
 * 记录接口真正返回的 level（可能因版权/会员限制降级）、码率、格式与文件大小。
 * 全部失败时降级到旧接口拿默认音源，保证仍可下载。
 */
export async function getSongQualities(id: number): Promise<QualityResult> {
  const hit = qualityCache.get(id)
  if (hit && Date.now() - hit.at < QUALITY_TTL) return hit.data

  const putCache = (data: QualityResult) => {
    qualityCache.set(id, { at: Date.now(), data })
    if (qualityCache.size > 80) {
      const now = Date.now()
      for (const [k, v] of qualityCache) if (now - v.at > QUALITY_TTL) qualityCache.delete(k)
    }
    return data
  }

  // 1) 优先用歌曲详情：直接拿到歌曲拥有的各档音质与准确文件大小，
  //    不依赖 song_url_v1，避免风控时列表为空。实际可下载档位在下载时再确认。
  try {
    const body = await callApi('song_detail', { ids: String(id) })
    const song = body?.songs?.[0]
    if (song) {
      const list: QualityProbe[] = []
      const add = (level: string, meta: any, lossless: boolean) => {
        if (!meta || !meta.br) return
        list.push({
          level,
          actualLevel: level,
          available: true,
          br: meta.br,
          size: meta.size,
          type: lossless ? 'flac' : 'mp3',
          fee: song.fee,
          url: ''
        })
      }
      add('standard', song.l, false)
      add('higher', song.m, false)
      add('exhigh', song.h, false)
      add('lossless', song.sq, true)
      add('hires', song.hr, true)
      if (list.length) return putCache({ probes: list })
    }
  } catch (e: any) {
    console.warn('[qualities] 歌曲详情获取失败:', e?.message || e)
  }

  // 2) 详情不可用：退回逐档探测
  const probes: QualityProbe[] = []
  let failed = 0
  for (const level of QUALITY_LEVELS) {
    try {
      const body = await callApi('song_url_v1', { id, level })
      const d = body?.data?.[0]
      if (d?.url) {
        probes.push({
          level,
          actualLevel: d.level || '',
          available: true,
          url: d.url,
          br: d.br,
          type: d.type,
          size: d.size,
          fee: d.fee,
          payed: !!d.payed,
          trial: !!d.freeTrialInfo
        })
      } else {
        probes.push({ level, actualLevel: d?.level || '', available: false })
      }
    } catch {
      failed++
      probes.push({ level, actualLevel: '', available: false })
    }
    await sleep(90)
  }

  let result: QualityResult = { probes }

  // 全部档位都请求失败：用旧接口兜底，至少给一个可下载音源
  if (failed === QUALITY_LEVELS.length) {
    try {
      const body = await callApi('song_url', { id })
      const d = body?.data?.[0]
      if (d?.url) {
        result = {
          probes: [{
            level: d.level || 'standard',
            actualLevel: d.level || '',
            available: true,
            url: d.url,
            br: d.br,
            type: d.type,
            size: d.size,
            fee: d.fee,
            payed: !!d.payed,
            trial: !!d.freeTrialInfo
          }],
          error: '音质列表查询受限，已改用接口默认音源'
        }
      } else {
        result = { probes: [], error: '音质查询失败：网易云网络环境限制，请稍后重试' }
      }
    } catch {
      result = { probes: [], error: '音质查询失败：网易云网络环境限制，请稍后重试' }
    }
  }

  return putCache(result)
}

/** 登录态变化后清空音质缓存，避免沿用旧账号的可用性 */
export function clearQualityCache(): void {
  qualityCache.clear()
}

export interface SmartSearchResult {
  songs: any[]
  playlists: any[]
  albums: any[]
  artists: any[]
  shows: any[]
  lyricSongs: any[]
  via: string
  error?: string
}

/** 搜索限频冷却：被网易云判定「操作频繁」后，先歇一会儿再请求，避免越试越糟 */
let rateLimitedUntil = 0
function rateLimitLeft(): number {
  return Math.max(0, rateLimitedUntil - Date.now())
}

/** 搜索结果缓存（5 分钟），重复搜索不再打接口 */
const SEARCH_TTL = 5 * 60 * 1000
const searchCache = new Map<string, { at: number; data: SmartSearchResult }>()

/**
 * 搜索：
 * 1) 云搜索按有效类型逐个取（1 单曲 / 1000 歌单 / 100 歌手 / 10 专辑）
 *    注意：type 1018 是无效类型，会返回空对象，千万别用
 * 2) 听书 / 歌词用旧 search 接口补（返回结构不同）
 * 3) 全部串行 + 320ms 间隔，避免并发触发「操作频繁」
 * 4) 命中限频则冷却 20 秒，期间直接给提示，不再打接口
 */
export async function smartSearch(keyword: string): Promise<SmartSearchResult> {
  const kw = keyword.trim()
  const out: SmartSearchResult = { songs: [], playlists: [], albums: [], artists: [], shows: [], lyricSongs: [], via: '' }
  if (!kw) return out

  const cached = searchCache.get(kw)
  if (cached && Date.now() - cached.at < SEARCH_TTL) {
    return { ...cached.data, via: 'cache' }
  }

  const left = rateLimitLeft()
  if (left > 0) {
    out.error = `搜索有点频繁，等 ${Math.ceil(left / 1000)} 秒再试`
    return out
  }

  let failures = 0
  // 只发 3 个请求：单曲 / 歌单 / 歌手；专辑、听书、歌词等点开对应分类时再加载
  try {
    const body = await callApi('cloudsearch', { keywords: kw, type: 1, limit: 60, offset: 0 })
    out.songs = body?.result?.songs || []
  } catch {
    failures++
    try {
      const body = await callApi('search', { keywords: kw, type: 1, limit: 60, offset: 0 })
      out.songs = body?.result?.songs || []
    } catch { failures++ }
  }
  try {
    const body = await callApi('cloudsearch', { keywords: kw, type: 1000, limit: 30, offset: 0 })
    out.playlists = body?.result?.playlists || []
  } catch { failures++ }
  try {
    const body = await callApi('cloudsearch', { keywords: kw, type: 100, limit: 12, offset: 0 })
    out.artists = body?.result?.artists || []
  } catch { failures++ }

  out.via = 'cloudsearch'
  if (out.songs.length || out.playlists.length || out.artists.length) {
    if (searchCache.size > 60) searchCache.clear()
    searchCache.set(kw, { at: Date.now(), data: out })
  } else if (failures >= 2) {
    out.error = rateLimitLeft() > 0 ? '搜索有点频繁，等几秒再试' : '搜索暂时没有响应，请稍后重试'
  }
  return out
}

/**
 * 搜索结果的补充分区（点开对应标签时再加载）：
 * - albums：云搜索 type 10
 * - shows：旧 search type 1009
 * - lyrics：旧 search type 1006
 */
export async function searchSection(keyword: string, kind: 'albums' | 'shows' | 'lyrics'): Promise<any[]> {
  const kw = keyword.trim()
  if (!kw) return []
  const left = rateLimitLeft()
  if (left > 0) throw new Error(`搜索有点频繁，等 ${Math.ceil(left / 1000)} 秒再试`)
  if (kind === 'albums') {
    const body = await callApi('cloudsearch', { keywords: kw, type: 10, limit: 12, offset: 0 })
    return body?.result?.albums || []
  }
  if (kind === 'shows') {
    const body = await callApi('search', { keywords: kw, type: 1009, limit: 20, offset: 0 })
    return body?.result?.shows || body?.result?.programList || body?.result?.djRadios || []
  }
  const body = await callApi('search', { keywords: kw, type: 1006, limit: 20, offset: 0 })
  return body?.result?.songs || []
}
