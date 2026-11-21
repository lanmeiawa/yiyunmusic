import { QUALITY_OPTIONS, type QualityProbe } from '../types'

/** 请求等级 → 中文名 */
export function levelLabel(level: string): string {
  return QUALITY_OPTIONS.find((q) => q.level === level)?.label || level || '未知'
}

/** 探针的可读描述：极高 · 320kbps · MP3 */
export function probeLabel(p: QualityProbe): string {
  const name = levelLabel(p.actualLevel || p.level)
  const br = p.br ? `${Math.round(p.br / 1000)}kbps` : ''
  const type = (p.type || '').toUpperCase()
  return [name, br, type].filter(Boolean).join(' · ')
}

/** 文件大小格式化 */
export function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

/**
 * 按接口实际返回等级去重：
 * 请求无损但账号/版权不支持时会降级为极高，此时只保留最匹配的一条，
 * 避免列表里出现多个一模一样的 320k 选项。
 * 注意：来自歌曲详情的音质项没有下载地址（下载时才换取），不能因 url 为空被过滤。
 */
export function uniqueProbes(probes: QualityProbe[]): QualityProbe[] {
  const out: QualityProbe[] = []
  for (const p of probes) {
    if (!p.available) continue
    if (out.some((u) => u.actualLevel === p.actualLevel && u.br === p.br)) continue
    out.push(p)
  }
  return out
}
