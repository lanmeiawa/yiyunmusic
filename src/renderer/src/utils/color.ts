/** 颜色工具：hex → rgba、hex 调亮 */

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
  const r = parseInt(full.slice(0, 2), 16) || 0
  const g = parseInt(full.slice(2, 4), 16) || 0
  const b = parseInt(full.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** amount 0~1：0 原色，1 白色 */
export function mixHex(hex: string, withHex: string, amount: number): string {
  const parse = (h: string) => {
    const x = h.replace('#', '')
    const f = x.length === 3 ? x.split('').map((c) => c + c).join('') : x
    return [parseInt(f.slice(0, 2), 16) || 0, parseInt(f.slice(2, 4), 16) || 0, parseInt(f.slice(4, 6), 16) || 0]
  }
  const [r1, g1, b1] = parse(hex)
  const [r2, g2, b2] = parse(withHex)
  const mix = (a: number, b: number) => Math.round(a + (b - a) * amount)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(mix(r1, r2))}${toHex(mix(g1, g2))}${toHex(mix(b1, b2))}`
}
