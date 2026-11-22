import type { LyricLine, WordToken } from '../types'

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g

function timeToSec(min: string, sec: string, fracRaw?: string): number {
  const frac = parseInt((fracRaw || '0').padEnd(3, '0').slice(0, 3), 10) / 1000
  return parseInt(min, 10) * 60 + parseInt(sec, 10) + frac
}

/** 解析普通 LRC 文本为带时间戳的行 */
/** 歌词头部制作信息（作词/作曲等），不是演唱内容，不能占用前奏的等待时间 */
const LYRIC_META_RE = /^(作词人?|作曲人?|编曲|制作人?|演唱|原唱|出品|发行|监制|录音|混音|母带|吉他|贝斯|鼓手?|键盘|和声|弦乐|词|曲|producer|composer|lyricist|lyrics?|arranger?|mixing|mastering|op|sp)\s*[:：]/i

function parseLrc(text: string): LyricLine[] {
  if (!text) return []
  const lines: LyricLine[] = []
  text.split(/\r?\n/).forEach((line) => {
    const matches: RegExpExecArray[] = []
    TIME_TAG.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = TIME_TAG.exec(line)) !== null) matches.push(m)
    if (matches.length === 0) return
    const content = line.replace(TIME_TAG, '').trim()
    if (LYRIC_META_RE.test(content)) return
    matches.forEach((match) => {
      const time = timeToSec(match[1], match[2], match[3])
      lines.push({ time, text: content })
    })
  })
  lines.sort((a, b) => a.time - b.time)
  // 填充每行结束时间 = 下一行开始时间
  for (let i = 0; i < lines.length; i++) {
    lines[i].end = i + 1 < lines.length ? lines[i + 1].time : lines[i].time + 5
  }
  return lines
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
    if (/^(作词|作曲|编曲|演唱|制作|lyrics|composed|arranger|作詞|作曲)/i.test(firstText) && tags.length <= 2) return

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
  return main
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
 * 计算某行的逐字点亮进度。
 * 有 words 时间轴则按字时间精确计算；否则按行 time~end 线性推算。
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
      if (time >= w.end) {
        filled += 1
      } else if (time >= w.time) {
        activeWord = i
        wordRatio = Math.max(0, Math.min(1, (time - w.time) / Math.max(0.001, w.end - w.time)))
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

  // 无逐字时间轴：按行时长线性
  const start = line.time
  const end = line.end && line.end > start ? line.end : start + Math.max(0.8, (line.text || '').length * 0.18)
  const ratio = Math.max(0, Math.min(1, (time - start) / (end - start)))
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
 * 只有空档大于 2.2 秒才算间奏，避免正常换句时高亮闪烁。
 */
export function isLyricGap(line: LyricLine | undefined, next: LyricLine | undefined, time: number): boolean {
  if (!line) return false
  const estEnd = line.words?.length && line.end
    ? line.end
    : line.time + Math.min(9, Math.max(1.6, (line.text?.length || 0) * 0.3))
  if (time <= estEnd + 0.7) return false
  const gap = next ? next.time - estEnd : Number.POSITIVE_INFINITY
  return gap > 2.2
}
