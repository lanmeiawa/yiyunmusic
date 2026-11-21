/**
 * 有声书模块：分页遍历 + 限频保护 + 聚合分类 + 磁盘缓存
 *
 * 设计要点：
 * 1. paginated()：通用 limit/offset 遍历器，每页间隔 DELAY_MS，遇 406/429/403 指数退避
 * 2. fetchAudiobookAll()：多分类聚合（电台分类 × 节目榜），合并去重，按分类归档
 * 3. 磁盘缓存：userData/dj-cache.json，TTL 6h；命中秒回，过期后台静默刷新
 */
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  dj_hot,
  dj_recommend,
  dj_program,
  dj_category_recommend
} from 'NeteaseCloudMusicApi'

const DELAY_MS = 700          // 每页请求间隔（防限频）
const MAX_PAGES_HOT = 6       // 热门电台最多遍历页数（30/页 → 最多 ~180 个）
const MAX_PAGES_PROGRAM = 4   // 单电台节目最多遍历页数
const CACHE_TTL = 6 * 3600 * 1000  // 缓存 6 小时

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 判定是否为限频/风控错误（406 运营限制、429、403） */
function isRateLimited(e: any): boolean {
  const code = e?.body?.code ?? e?.status
  return code === 406 || code === 429 || code === 403
}

/** 通用分页遍历器：循环 offset 直到取完/达到页数上限；带间隔与限频退避 */
async function paginated<T>(
  fetchPage: (limit: number, offset: number) => Promise<T[]>,
  opts: { pageSize?: number; maxPages?: number; onProgress?: (n: number) => void } = {}
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 30
  const maxPages = opts.maxPages ?? 6
  const all: T[] = []
  const seen = new Set<string>()

  for (let page = 0; page < maxPages; page++) {
    let items: T[] = []
    let attempt = 0
    // 指数退避：406/429 时 2s → 6s 重试，最多 3 次
    while (attempt < 3) {
      try {
        items = await fetchPage(pageSize, page * pageSize)
        break
      } catch (e: any) {
        if (isRateLimited(e) && attempt < 2) {
          await sleep(2000 * Math.pow(3, attempt))
          attempt++
          continue
        }
        throw e
      }
    }

    let fresh = 0
    for (const it of items) {
      const key = String((it as any)?.id ?? '')
      if (!key || seen.has(key)) continue
      seen.add(key)
      all.push(it)
      fresh++
    }
    opts.onProgress?.(all.length)
    // 取完（不足一页说明到末尾，或全是重复数据）
    if (items.length < pageSize || fresh === 0) break
    await sleep(DELAY_MS)
  }
  return all
}

interface DjRadio {
  id: number
  name: string
  picUrl: string
  programCount: number
  category: string
  subCount?: number
}

interface DjProgram {
  id: number
  name: string
  radioName: string
  radioId: number
  cover: string
  duration: number
  mainSongId: number
  fee: number
  createDate?: number
}

/** 归一化电台对象 */
function mapRadio(r: any, fallbackCat: string): DjRadio | null {
  if (!r?.id) return null
  return {
    id: r.id,
    name: r.name || '未命名电台',
    picUrl: r.picUrl || '',
    programCount: r.programCount || 0,
    category: r.category || fallbackCat,
    subCount: r.subCount || 0
  }
}

/** 归一化节目对象 */
function mapProgram(p: any): DjProgram | null {
  const pg = p.program || p
  const ms = pg.mainSong || {}
  if (!ms.id) return null
  return {
    id: ms.id,
    name: pg.name || ms.name || '未知节目',
    radioName: pg.radio?.name || pg.dj?.nickname || '电台节目',
    radioId: pg.radio?.id || 0,
    cover: pg.coverUrl || ms.picUrl || '',
    duration: pg.duration || ms.duration || 0,
    mainSongId: ms.id,
    fee: ms.fee || 0,
    createDate: pg.createDate
  }
}

/** 磁盘缓存 */
function cachePath(): string {
  return path.join(app.getPath('userData'), 'dj-cache.json')
}
function readCache(): any | null {
  try {
    const raw = fs.readFileSync(cachePath(), 'utf8')
    const data = JSON.parse(raw)
    if (Date.now() - data.savedAt < CACHE_TTL) return data.payload
    return null
  } catch { return null }
}
/** 无视 TTL 读旧缓存（刷新增量合并用） */
function readCacheIgnoreTtl(): any | null {
  try {
    const raw = fs.readFileSync(cachePath(), 'utf8')
    const data = JSON.parse(raw)
    return data.payload || null
  } catch { return null }
}
function writeCache(payload: any): void {
  try {
    fs.mkdirSync(path.dirname(cachePath()), { recursive: true })
    fs.writeFileSync(cachePath(), JSON.stringify({ savedAt: Date.now(), payload }))
  } catch { }
}

/** 聚合拉取有声书全集：多分类电台 + 节目榜，合并归类；刷新时增量追加（新内容在前，旧内容保留） */
async function fetchAudiobookAll(onProgress?: (msg: string, n: number) => void) {
  // 命中缓存直接返回
  const cached = readCache()
  if (cached) return { ...cached, fromCache: true, freshCount: 0 }
  // 未命中：读取旧缓存用于增量合并（旧电台保留，新发现的排前面）
  const oldCached = readCacheIgnoreTtl()

  // 1) 分类组（含各分类推荐电台）
  onProgress?.('拉取分类数据…', 0)
  let catGroups: { categoryId: number; categoryName: string; radios: DjRadio[] }[] = []
  try {
    const r = await dj_category_recommend({ type: 10001 }, { cookie: '' })
    catGroups = (r.body?.data || []).map((g: any) => ({
      categoryId: g.categoryId,
      categoryName: g.categoryName,
      radios: (g.radios || []).map((x: any) => mapRadio(x, g.categoryName)).filter(Boolean) as DjRadio[]
    }))
  } catch { }

  // 2) 热门电台分页遍历（30/页 × 6 页），按 category 归类
  onProgress?.('遍历热门电台…', 0)
  const hotRadios = await paginated<DjRadio>(
    async (limit, offset) => {
      const r = await dj_hot({ limit, offset }, { cookie: '' })
      return (r.body?.djRadios || []).map((x: any) => mapRadio(x, '热门')).filter(Boolean) as DjRadio[]
    },
    { maxPages: MAX_PAGES_HOT, onProgress: (n) => onProgress?.('热门电台', n) }
  )

  // 3) 推荐电台（一次返回，作为补充）
  onProgress?.('拉取推荐电台…', hotRadios.length)
  let recRadios: DjRadio[] = []
  try {
    const r = await dj_recommend({}, { cookie: '' })
    recRadios = (r.body?.djRadios || r.body?.data || []).map((x: any) => mapRadio(x, '推荐')).filter(Boolean) as DjRadio[]
  } catch { }

  // 4) 聚合去重（电台维度），保留分类标签
  const radioMap = new Map<number, DjRadio>()
  const absorb = (list: DjRadio[]) => {
    for (const r of list) {
      const prev = radioMap.get(r.id)
      if (!prev) radioMap.set(r.id, r)
      else if (!prev.category || prev.category === '热门' || prev.category === '推荐') {
        // 优先保留具体分类标签
        radioMap.set(r.id, { ...r })
      }
    }
  }
  // 先吸收旧缓存电台（占位），再吸收新拉取的（新数据覆盖/置前）
  const oldMap = new Map<number, DjRadio>()
  if (oldCached?.byCategory) {
    for (const [cat, list] of Object.entries(oldCached.byCategory as Record<string, DjRadio[]>)) {
      for (const r of list || []) {
        if (!r?.id) continue
        oldMap.set(r.id, { ...r, category: r.category || cat })
      }
    }
  }
  absorb(hotRadios)
  absorb(recRadios)
  for (const g of catGroups) absorb(g.radios)
  // 旧电台中不在新结果里的：追加保留（旧的也留着）
  for (const [id, r] of oldMap) {
    if (!radioMap.has(id)) radioMap.set(id, r)
  }

  // 5) 按分类归档
  const byCategory: Record<string, DjRadio[]> = {}
  for (const r of radioMap.values()) {
    const cat = r.category || '其他'
    ;(byCategory[cat] ||= []).push(r)
  }
  // 保证有声书分类存在（聚合 dj_recommend/hot 中带"有声书"标签的）
  const audiobook = [...(byCategory['有声书'] || [])]

  // 6) 节目榜（全局热门节目，供"热门节目"入口；每电台节目按需拉取）
  onProgress?.('拉取热门节目…', radioMap.size)
  let hotPrograms: DjProgram[] = []
  try {
    const top = await paginated<DjProgram>(
      async (limit, offset) => {
        const r = await dj_program({ rid: audiobook[0]?.id || radioMap.values().next().value?.id, limit, offset, asc: false })
        return (r.body?.programs || []).map(mapProgram).filter(Boolean) as DjProgram[]
      },
      { maxPages: 1 }
    )
    hotPrograms = top
  } catch { }

  // 本次新发现数量 = 合并后总数 - 旧缓存电台数
  let oldCount = 0
  for (const list of Object.values(oldCached?.byCategory || {})) oldCount += (list as any[]).length
  const freshCount = Math.max(0, radioMap.size - oldCount)
  const payload = {
    categories: catGroups.map((g) => ({ categoryId: g.categoryId, categoryName: g.categoryName, count: g.radios.length })),
    byCategory,
    audiobook,
    totalRadios: radioMap.size,
    hotPrograms,
    fetchedAt: Date.now()
  }
  writeCache(payload)
  return { ...payload, fromCache: false, freshCount }
}

export { fetchAudiobookAll, paginated, sleep }
