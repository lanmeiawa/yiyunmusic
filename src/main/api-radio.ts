/**
 * 在线收音机数据源：Radio Browser（radio-browser.info）
 * - 免费开源、公共领域数据、无需 API key
 * - 多镜像 fallback：DNS 轮询 all.api.radio-browser.info 拿到服务器列表，逐个尝试
 * - 必须带 User-Agent（官方要求）
 * - 用 stationuuid 标识电台，不用 id
 */

const UA = 'yiyunmusic/2.1.0 (https://github.com/lanmeiawa/yiyunmusic)'
const DEFAULT_SERVERS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info'
]

let cachedServers: string[] | null = null

/** 拉取镜像列表（带缓存，失败则用内置默认） */
async function getServers(): Promise<string[]> {
  if (cachedServers && cachedServers.length) return cachedServers
  try {
    const r = await fetch('https://all.api.radio-browser.info/json/servers', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000)
    })
    if (r.ok) {
      const list = await r.json() as Array<{ name: string }>
      const urls = (list || [])
        .map((s) => `https://${s.name}`)
        .filter((u) => /^https:\/\/[a-z0-9.-]+\.api\.radio-browser\.info$/i.test(u))
      if (urls.length) { cachedServers = urls; return urls }
    }
  } catch { /* 用默认列表 */ }
  cachedServers = DEFAULT_SERVERS
  return DEFAULT_SERVERS
}

/** 对多个镜像依次尝试同一个请求路径 */
async function request(path: string): Promise<any> {
  const servers = await getServers()
  let lastErr: any
  // 内置列表 + 默认列表去重，最多试 6 台
  const tried = new Set<string>()
  for (const base of [...servers, ...DEFAULT_SERVERS]) {
    if (tried.has(base)) continue
    tried.add(base)
    try {
      const r = await fetch(base + path, {
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12000)
      })
      if (r.ok) return await r.json()
      lastErr = new Error(`HTTP ${r.status} @ ${base}`)
    } catch (e) { lastErr = e }
  }
  throw lastErr || new Error('所有电台镜像均不可用')
}

/** 把 API 的 station 对象映射为渲染层结构 */
function mapStation(s: any) {
  return {
    stationuuid: s.stationuuid || '',
    name: s.name || '',
    url: s.url || '',
    urlResolved: s.url_resolved || s.url || '',
    favicon: s.favicon || '',
    country: s.country || '',
    countryCode: s.countrycode || '',
    state: s.state || '',
    language: s.language || '',
    tags: typeof s.tags === 'string' ? s.tags.split(',').filter(Boolean).slice(0, 6) : [],
    codec: s.codec || '',
    bitrate: Number(s.bitrate) || 0,
    votes: Number(s.votes) || 0,
    clickCount: Number(s.clickcount) || 0
  }
}

export type RadioQuery = {
  mode?: 'search' | 'top' | 'country' | 'tag' | 'random'
  keyword?: string
  countryCode?: string
  tag?: string
  limit?: number
  offset?: number
}

/** 国家名 → ISO 代码（渲染层传的是「中国」这类名称，接口只认 CN） */
let countryMap: Record<string, string> | null = null
async function getCountryMap(): Promise<Record<string, string>> {
  if (countryMap) return countryMap
  try {
    const list = await request('/json/countries') as any[]
    const map: Record<string, string> = {}
    for (const c of Array.isArray(list) ? list : []) {
      const name = String(c?.name || '').trim().toLowerCase()
      const code = String(c?.iso_3166_1 || '').trim().toUpperCase()
      if (name && /^[A-Z]{2}$/.test(code)) map[name] = code
    }
    countryMap = map
  } catch { countryMap = {} }
  return countryMap
}

/** 把「中国 / CN / cn」统一成两位国家代码 */
async function normalizeCountryCode(raw?: string): Promise<string> {
  const v = String(raw || '').trim()
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase()
  if (!v) return 'CN'
  const map = await getCountryMap()
  return map[v.toLowerCase()] || 'CN'
}

/** 搜索 / 浏览电台 */
export async function fetchStations(q: RadioQuery = {}): Promise<any[]> {
  const limit = Math.max(1, Math.min(120, q.limit || 40))
  const offset = Math.max(0, q.offset || 0)
  let path: string
  const enc = encodeURIComponent
  switch (q.mode) {
    case 'top':
      path = `/json/stations/topclick/${limit}?hidebroken=true&offset=${offset}`
      break
    case 'country': {
      const code = await normalizeCountryCode(q.countryCode)
      path = `/json/stations/search?countrycode=${enc(code)}&hidebroken=true&order=clickcount&reverse=true&limit=${limit}&offset=${offset}`
      break
    }
    case 'tag':
      path = `/json/stations/search?tag=${enc(q.tag || 'jazz')}&hidebroken=true&order=clickcount&reverse=true&limit=${limit}&offset=${offset}`
      break
    case 'random':
      path = `/json/stations?hidebroken=true&order=random&limit=${limit}`
      break
    case 'search':
    default: {
      const kw = (q.keyword || '').trim()
      path = kw
        ? `/json/stations/search?name=${enc(kw)}&hidebroken=true&order=clickcount&reverse=true&limit=${limit}&offset=${offset}`
        : `/json/stations/topclick/${limit}?hidebroken=true&offset=${offset}`
    }
  }
  const data = await request(path)
  return (Array.isArray(data) ? data : []).map(mapStation)
}

/** 国家 / 标签列表（用于分类浏览）：按电台数量排序，常用项排前面 */
export async function fetchFacets(kind: 'countries' | 'tags'): Promise<string[]> {
  const data = await request(`/json/${kind}`)
  return (Array.isArray(data) ? data : [])
    .map((x: any) => ({ name: String(x.name || '').trim(), count: Number(x.stationcount) || 0 }))
    .filter((x) => x.name)
    .sort((a, b) => b.count - a.count)
    .map((x) => x.name)
    .slice(0, 120)
}

/** 用户点击播放时上报，帮助维护热度排名（失败静默） */
export async function registerClick(uuid: string): Promise<void> {
  if (!uuid) return
  try {
    const servers = await getServers()
    await fetch(`${servers[0]}/json/url/${encodeURIComponent(uuid)}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(5000)
    })
  } catch { /* 上报失败不影响播放 */ }
}
