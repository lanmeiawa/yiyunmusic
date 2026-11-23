import type { LyricLine, WordToken } from '../types'

// 兼容两种写法：[00:12.34] 和少数文件用的 [00:12:34]
const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g
// LRC 头部偏移量（毫秒），正数表示整体延后
const OFFSET_TAG = /\[offset:\s*([+-]?\d+)\s*\]/i

function timeToSec(min: string, sec: string, fracRaw?: string): number {
  const frac = parseInt((fracRaw || '0').padEnd(3, '0').slice(0, 3), 10) / 1000
  return parseInt(min, 10) * 60 + parseInt(sec, 10) + frac
}

/** 歌词头部制作信息（作词/作曲等），不是演唱内容，不能占用前奏的等待时间 */
const LYRIC_META_RE = /^(作词人?|作曲人?|编曲|制作人?|演唱|原唱|出品|发行|监制|录音|混音|母带|吉他|贝斯|鼓手?|键盘|和声|弦乐|词|曲|producer|composer|lyricist|lyrics?|arranger?|mixing|mastering|op|sp)\s*[:：]/i

/**
 * 更全的制作信息标签。真实歌词文件里常见「企划 :」「录音师 :」「和音 :」
 * 「母带后期处理录音室 :」这类写法，只列固定几个词会漏掉，漏掉的那一行
 * 会顶替第一句歌词的位置，在前奏里亮十几秒。
 */
const CREDIT_PREFIX = /^(作词|作詞|作曲|编曲|編曲|制作|製作|监制|監製|出品|发行|發行|录音|錄音|混音|母带|母帶|后期|後期|企划|企劃|统筹|統籌|策划|策劃|宣传|宣傳|营销|宣发|封面|设计|設計|视觉|插画|摄影|造型|艺人|藝人|经纪|經紀|人声|人聲|和声|和音|弦乐|弦樂|吉他|贝斯|貝斯|钢琴|鋼琴|小提琴|大提琴|中提琴|口琴|萨克斯|二胡|古筝|古箏|琵琶|笛子|箫|合成器|打击乐|鼓手|键盘|鍵盤|录音室|錄音室|录音棚|工作室|艺术指导|音乐制作|制作助理|总策划|总监制|总制作|出品人|联合出品|版权|鸣谢|致谢|感谢|编辑|修音|音编|宣推|推广|编程|伴唱|总监|采样|填词|缩混|合作|录制|工程师|原著|平台|项目总监|后期母带|producer|composer|arranger|lyricist|mixing|mastering|recorded|guitar|bass|drums|keyboard|vocals|chorus|strings|piano|design|management|executive|marketing|art direction|photography|stylist|makeup|a&r)/i
const SHORT_CREDIT = /^(词|曲|op|sp)$/i
/** 组合型署名（总策划 / 艺术指导 / 音乐制作助理…），标签里带这些词就按制作信息处理 */
const CREDIT_ANY = /(策划|策劃|统筹|統籌|监制|監製|制作|製作|企划|企劃|宣发|宣推|营销|推广|版权|版權|出品|发行|發行|录音|錄音|混音|母带|母帶|指导|指導|设计|設計|管理|鸣谢|致谢|编辑|编写|修音|编程|伴唱|总监|采样|填词|缩混|合作|录制|工程师|原著|平台)/

/** 平台宣传语 / 水印行：不是歌词，留在末尾会被当最后一句一直亮着 */
const PROMO_RE = /^(本歌曲|10亿现金|业务联系|商务合作|未经许可|未经授权|版权归|网易云音乐|网易音乐人|酷狗音乐|QQ音乐)/

/** 是否是「标签 : 内容」形式的制作信息行（导出便于单测） */
export function isCreditLine(text: string): boolean {
  const m = /^\s*([^:：]{1,40})[:：]/.exec(text)
  if (!m) return false
  const tag = m[1].trim()
  const rest = text.slice(m[0].length).trim()
  if (!tag) return false
  if (SHORT_CREDIT.test(tag) || CREDIT_PREFIX.test(tag)) return true
  // 「词 Lyrics :」「曲 Composer :」这类中英混写
  if (/^(词|曲)(\s|$)/.test(tag)) return true
  // 「林达浪：」这种只有署名、没有内容的行
  if (!rest && tag.length <= 12) return true
  if (tag.length <= 20 && CREDIT_ANY.test(tag)) return true
  // 乐器署名：第一小提琴 / 原声吉他 / 鼓和钢琴 …
  if (tag.length <= 20 && /(小提琴|大提琴|中提琴|钢琴|鋼琴|吉他|贝斯|貝斯|鼓|长笛|小号|萨克斯|二胡|古筝|古箏|琵琶|合成器)/.test(tag)) return true
  // 英文署名：Written by: / Mastering Studio: / Recorded at: …
  if (/(written\s+by|mastering|mastered|recorded|mixed|produced|arranged|composed|lyrics?\s+by|studio|engineer)/i.test(tag)) return true
  return false
}

function parseLrc(text: string): LyricLine[] {
  if (!text) return []
  const offsetMatch = OFFSET_TAG.exec(text)
  const offset = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0
  const lines: LyricLine[] = []
  text.split(/\r?\n/).forEach((line) => {
    const matches: RegExpExecArray[] = []
    TIME_TAG.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = TIME_TAG.exec(line)) !== null) matches.push(m)
    if (matches.length === 0) return
    const content = line.replace(TIME_TAG, '').trim()
    if (!content) return
    if (PROMO_RE.test(content) || /^[〖【].*[〗】]$/.test(content)) return
    if (LYRIC_META_RE.test(content) || isCreditLine(content)) return
    matches.forEach((match) => {
      const time = Math.max(0, timeToSec(match[1], match[2], match[3]) + offset)
      lines.push({ time, text: content })
    })
  })
  lines.sort((a, b) => a.time - b.time)
  // 同一时间戳的重复行：文字相同直接去重，不同则合并（否则总有一行永远显示不出来）
  // 只在时间点有效时处理；坏文件里整篇都是 [00:00.00] 的情况保持原样，避免把整首歌粘成一行
  const merged: LyricLine[] = []
  for (const line of lines) {
    const prev = merged[merged.length - 1]
    if (prev && line.time > 0.2 && Math.abs(prev.time - line.time) < 0.03 && prev.text.length + line.text.length <= 80) {
      if (prev.text !== line.text) prev.text = `${prev.text} ${line.text}`
      continue
    }
    merged.push(line)
  }
  // 填充每行结束时间 = 下一行开始时间
  for (let i = 0; i < merged.length; i++) {
    merged[i].end = i + 1 < merged.length ? merged[i + 1].time : merged[i].time + 5
  }
  return merged
}

/**
 * 解析网易云 klyric（增强逐字歌词）
 * 形如：[00:19.000]你[00:19.500]的[00:20.000]眼[00:20.500]睛
 * 返回按行组织的 Line（含 words 逐字时间轴）
 */
function parseKlyric(text: string): LyricLine[] {
  if (!text) return []
  const result: LyricLine[] = []
  text.split(/\r?\n/).forEach((line) => {
    TIME_TAG.lastIndex = 0
    const tags: { time: number; start: number; end: number }[] = []
    let m: RegExpExecArray | null
    while ((m = TIME_TAG.exec(line)) !== null) {
      tags.push({ time: timeToSec(m[1], m[2], m[3]), start: m.index, end: m.index + m[0].length })
    }
    if (tags.length === 0) return
    // 元数据行（作词/作曲/编曲等）跳过
    const firstText = line.slice(tags[0].end, tags.length > 1 ? tags[1].start : undefined).trim()
    if ((/^(作词|作曲|编曲|演唱|制作|lyrics|composed|arranger|作詞)/i.test(firstText) && tags.length <= 2) || isCreditLine(firstText)) return

    const words: WordToken[] = []
    for (let i = 0; i < tags.length; i++) {
      const segEnd = i + 1 < tags.length ? tags[i + 1].start : line.length
      const segText = line.slice(tags[i].end, segEnd).replace(/\s+/g, ' ')
      if (!segText.trim()) continue
      words.push({ text: segText, time: tags[i].time, end: tags[i].time })
    }
    if (!words.length) return
    // 每个字的结束时间 = 下一个字的开始时间；最后一字给 0.6s
    for (let i = 0; i < words.length; i++) {
      words[i].end = i + 1 < words.length ? words[i + 1].time : words[i].time + 0.6
    }
    const fullText = words.map((w) => w.text).join('').trim()
    result.push({ time: words[0].time, end: words[words.length - 1].end, text: fullText, words })
  })
  result.sort((a, b) => a.time - b.time)
  for (let i = 0; i < result.length; i++) {
    result[i].end = result[i].end || (i + 1 < result.length ? result[i + 1].time : result[i].time + 5)
  }
  return result
}

/** 合并原歌词、翻译歌词、逐字歌词（按时间对齐） */
export function parseLyric(lrcText: string, translationText?: string, klyricText?: string): LyricLine[] {
  const main = parseLrc(lrcText)
  if (!main.length) return []

  if (klyricText) {
    const kLines = parseKlyric(klyricText)
    // 按时间就近对齐（容差 0.45s）
    kLines.forEach((k) => {
      let best = -1
      let bestDiff = 0.45
      for (let i = 0; i < main.length; i++) {
        const diff = Math.abs(main[i].time - k.time)
        if (diff < bestDiff) { bestDiff = diff; best = i }
      }
      if (best >= 0 && !main[best].words) {
        main[best].words = k.words
        // 逐字歌词有真实的收尾时间，用它替换「下一句开始」的粗粒度结束时间，
        // 否则间奏判定永远不生效，最后一句会一直亮着
        main[best].end = k.end
      }
    })
  }

  if (translationText) {
    const trans = parseLrc(translationText)
    const transMap = new Map<number, string>()
    trans.forEach((t) => transMap.set(Math.round(t.time * 100), t.text))
    main.forEach((line) => {
      const key = Math.round(line.time * 100)
      if (transMap.has(key)) line.translation = transMap.get(key)
      else {
        // 翻译时间略有偏差时，就近匹配（0.2s 内）
        let bestDiff = 20
        trans.forEach((t) => {
          const d = Math.abs(Math.round(t.time * 100) - key)
          if (d < bestDiff) { bestDiff = d; line.translation = t.text }
        })
      }
    })
  }
  // 空行（只有时间戳、没有文字）是 LRC 里的间奏标记，不是歌词。
  // 留着会被渲染成一整片「♪」，还会让歌曲后半段被判成"间奏等待"，看着像歌词丢了。
  const cleaned = main.filter((l) => {
    const t = l.text.trim()
    return !!t && !/^[♪♫]+$/.test(t)
  })
  // 过滤后重新接上每行的结束时间（逐字歌词有真实结束时间，保留）
  for (let i = 0; i < cleaned.length; i++) {
    if (!cleaned[i].words?.length) {
      cleaned[i].end = i + 1 < cleaned.length ? cleaned[i + 1].time : cleaned[i].time + 5
    }
  }
  return cleaned
}

/** 根据当前播放时间找到活动行索引 */
export function findActiveIndex(lines: LyricLine[], time: number): number {
  if (!lines.length) return -1
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= time + 0.05) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

/** 逐字进度结果 */
export interface WordProgress {
  filled: number // 0~1，整行已点亮比例（按字数）
  activeWord: number // 当前正在点亮的 word 索引
  wordRatio: number // 当前 word 内已点亮比例 0~1
}

/**
 * 按字数估算一句歌词的演唱时长（秒）。
 * 用于「没有逐字时间轴」时的扫光节奏：LRC 只知道下一句什么时候开始，
 * 长间奏时那可能是几十秒后，直接拿它当结束时间会让最后几个字慢慢爬很久。
 */
export function estimateLineDuration(text: string): number {
  const t = text || ''
  const cjk = (t.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length
  const latin = (t.match(/[A-Za-z0-9']+/g) || []).length
  const rest = Math.max(0, t.length - cjk - latin)
  return Math.min(7.5, Math.max(0.9, cjk * 0.3 + latin * 0.42 + rest * 0.06))
}

/**
 * 计算某行的逐字点亮进度。
 * 有 words 时间轴则按字时间精确计算；否则按「估算的演唱时长」线性推算。
 */
export function computeWordProgress(line: LyricLine | undefined, time: number): WordProgress {
  const empty: WordProgress = { filled: 0, activeWord: -1, wordRatio: 0 }
  if (!line) return empty
  const words = line.words

  if (words && words.length) {
    let filled = 0
    let activeWord = -1
    let wordRatio = 0
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      // 单个字/词的真实时长偶尔会很长（拖长音、间奏前的最后一字），
      // 扫光最多用 1.8 秒走完，避免一个字亮着慢慢爬好几秒
      const wd = Math.max(0.06, Math.min(1.8, w.end - w.time))
      if (time >= w.time + wd) {
        filled += 1
      } else if (time >= w.time) {
        activeWord = i
        wordRatio = Math.max(0, Math.min(1, (time - w.time) / wd))
        filled += wordRatio
        break
      } else {
        activeWord = i
        wordRatio = 0
        break
      }
    }
    return { filled: filled / words.length, activeWord, wordRatio }
  }

  // 无逐字时间轴：起始时间取行时间，结束时间取「演唱时长」与「下一句开始」的较小值
  const start = line.time
  const est = estimateLineDuration(line.text)
  const gap = line.end && line.end > start ? line.end - start : est
  const end = start + Math.min(est, gap)
  const ratio = Math.max(0, Math.min(1, (time - start) / Math.max(0.15, end - start)))
  return { filled: ratio, activeWord: -1, wordRatio: 0 }
}

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * 判断当前时间是否处在「一句已唱完、下一句还没到」的间奏里。
 * 有逐字时间轴用真实结束时间；普通 LRC 没有结束时间，按字数估算（约 0.3s/字）。
 * - 空档超过 6 秒才算间奏：正常换句、短停顿都保持高亮，只有真正的长间奏才让出画面；
 * - 最后一句永远算「在唱」，尾奏再长也不会把整页变成空白（否则看着像后半段歌词丢了）。
 */
export function isLyricGap(line: LyricLine | undefined, next: LyricLine | undefined, time: number): boolean {
  if (!line) return false
  if (!next) return false
  const estEnd = line.words?.length && line.end
    ? line.end
    : line.time + estimateLineDuration(line.text)
  if (time <= estEnd + 0.7) return false
  return next.time - estEnd > 6
}
