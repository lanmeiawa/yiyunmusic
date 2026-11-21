import {
  login_qr_key,
  login_qr_create,
  login_qr_check,
  login_status,
  logout,
  user_playlist,
  playlist_detail,
  song_detail,
  song_url_v1,
  song_url,
  lyric as getLyric,
  check_music,
  search,
  user_detail,
  user_record,
  user_level,
  vip_info,
  user_account,
  recommend_songs,
  personalized_newsong,
  personalized,
  top_album,
  like,
  playlist_create,
  playlist_delete,
  playlist_tracks,
  personal_fm,
  dj_hot,
  dj_program,
  dj_program_toplist,
  dj_category_recommend,
  dj_recommend,
  comment,
  toplist,
  album,
  artist_top_song,
  search_hot_detail,
  search_suggest,
  cloudsearch,
  comment_hot,
  comment_music
} from 'NeteaseCloudMusicApi'
import { getCookie, mergeCookie, setCookie, setProfile, pushHistory, upsertAccount, getAccounts, setActiveAccountId } from './store'

type ApiFn = (params: Record<string, any>) => Promise<any>

const apiMap: Record<string, ApiFn> = {
  login_qr_key,
  login_qr_create,
  login_qr_check,
  login_status,
  logout,
  user_playlist,
  playlist_detail,
  song_detail,
  song_url_v1,
  song_url,
  lyric: getLyric,
  check_music,
  search,
  user_detail,
  user_record,
  user_level,
  vip_info,
  user_account,
  recommend_songs,
  personalized_newsong,
  personalized,
  top_album,
  album,
  artist_top_song,
  like,
  playlist_create,
  playlist_delete,
  playlist_tracks,
  personal_fm,
  dj_hot,
  dj_program,
  dj_program_toplist,
  dj_category_recommend,
  dj_recommend,
  comment,
  toplist,
  search_hot_detail,
  search_suggest,
  cloudsearch,
  comment_hot,
  comment_music
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
  return /timeout|timed out|network error|econnreset|econnrefused|enotfound|eai_again|socket hang up|aborted|exceeded|connect/i.test(msg)
}

const DEFAULT_TIMEOUT = 15000
const RETRY_LIMIT = 2

/**
 * 统一调用网易云接口（带兜底）：
 * - 参数规范化（修正 pid / like 等已知陷阱）
 * - 自动注入当前 cookie（登录态）
 * - 自动把接口返回的 Set-Cookie 合并进本地 cookie
 * - 默认 15s 超时；网络层错误自动重试（指数退避，最多 2 次）
 * - 统一返回 body（含 code），失败时抛出带 code/message 的结构化错误
 */
export async function callApi(name: string, params: Record<string, any> = {}): Promise<any> {
  const fn = apiMap[name]
  if (!fn) throw new Error(`未知接口: ${name}`)

  const merged = normalizeParams(name, params)
  const cookie = getCookie()
  if (cookie && merged.cookie === undefined) merged.cookie = cookie
  if (merged.timeout === undefined) merged.timeout = DEFAULT_TIMEOUT

  let lastErr: any
  for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
    try {
      const res: any = await fn(merged)
      // 合并 cookie（登录相关接口会返回新 cookie）
      if (res?.cookie) {
        const next = mergeCookie(getCookie(), res.cookie)
        if (next && next !== getCookie()) setCookie(next)
      }
      return res?.body ?? res
    } catch (e: any) {
      lastErr = e
      if (attempt >= RETRY_LIMIT || !isRetryable(e)) break
      console.warn(`[api] ${name} 调用失败，第 ${attempt + 1} 次重试:`, e?.body?.message || e?.body?.msg || e?.message || e)
      await sleep(400 * (attempt + 1))
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

/**
 * 多级兜底搜索：
 * 1) cloudsearch 综合（一次拿单曲/歌单/专辑/歌手，最稳）
 * 2) 旧 search 分类型并行（各自失败互不影响）
 * 3) search_suggest 建议词重搜
 * 只有多数接口都报错才返回 error；接口正常但结果为空属于「没有找到」。
 */
export async function smartSearch(keyword: string): Promise<SmartSearchResult> {
  const kw = keyword.trim()
  const out: SmartSearchResult = { songs: [], playlists: [], albums: [], artists: [], shows: [], lyricSongs: [], via: '' }
  let failures = 0

  const extras = async (k: string) => {
    const [dj, ly] = await Promise.all([
      callApi('search', { keywords: k, type: 1009, limit: 20, offset: 0 }).catch(() => null),
      callApi('search', { keywords: k, type: 1006, limit: 20, offset: 0 }).catch(() => null)
    ])
    out.shows = dj?.result?.shows || dj?.result?.programList || []
    out.lyricSongs = ly?.result?.songs || []
  }

  const hasAny = () => out.songs.length + out.playlists.length + out.albums.length + out.artists.length > 0

  // 1) 云搜索综合
  try {
    const body = await callApi('cloudsearch', { keywords: kw, type: 1018, limit: 60, offset: 0 })
    const r = body?.result || {}
    out.songs = r.songs || []
    out.playlists = r.playlists || []
    out.albums = r.albums || []
    out.artists = r.artists || []
    if (hasAny()) {
      out.via = 'cloudsearch'
      await extras(kw)
      return out
    }
  } catch (e: any) {
    failures++
    console.warn('[search] 云搜索失败，尝试旧接口:', e?.message || e)
  }

  // 2) 旧搜索分类型并行
  const tasks = [
    callApi('search', { keywords: kw, type: 1, limit: 60, offset: 0 }),
    callApi('search', { keywords: kw, type: 1000, limit: 30, offset: 0 }),
    callApi('search', { keywords: kw, type: 1009, limit: 20, offset: 0 }),
    callApi('search', { keywords: kw, type: 10, limit: 12, offset: 0 }),
    callApi('search', { keywords: kw, type: 100, limit: 12, offset: 0 }),
    callApi('search', { keywords: kw, type: 1006, limit: 20, offset: 0 })
  ]
  const [s, p, dj, al, ar, ly] = await Promise.all(tasks.map((t) => t.catch(() => { failures++; return null })))
  out.songs = s?.result?.songs || []
  out.playlists = p?.result?.playlists || []
  out.shows = dj?.result?.shows || dj?.result?.programList || []
  out.albums = al?.result?.albums || []
  out.artists = ar?.result?.artists || []
  out.lyricSongs = ly?.result?.songs || []
  if (hasAny() || out.shows.length || out.lyricSongs.length) {
    out.via = 'search'
    return out
  }

  // 3) 建议词重搜（处理生僻词/错别字）
  try {
    const sug = await callApi('search_suggest', { keywords: kw })
    const alt = (sug?.result?.allMatch?.[0]?.keyword || sug?.result?.songs?.[0]?.name || '').trim()
    if (alt && alt !== kw) {
      const body = await callApi('cloudsearch', { keywords: alt, type: 1018, limit: 60, offset: 0 })
      const r = body?.result || {}
      out.songs = r.songs || []
      out.playlists = r.playlists || []
      out.albums = r.albums || []
      out.artists = r.artists || []
      if (hasAny()) {
        out.via = `suggest:${alt}`
        await extras(alt)
        return out
      }
    }
  } catch (e: any) {
    failures++
    console.warn('[search] 建议词重搜失败:', e?.message || e)
  }

  if (failures >= 6) out.error = '搜索服务暂时不可用，请稍后重试'
  return out
}
