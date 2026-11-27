/** 规范化网易云封面地址：保留原协议（避免 https CDN 在部分网络环境下的证书兼容问题），附加尺寸参数节省带宽 */
export function coverUrl(url?: string, size = 300): string {
  if (!url) return ''
  // 本地封面（data URI / file 协议）不做网易云尺寸参数处理，避免破坏地址
  if (url.startsWith('data:') || url.startsWith('file:') || url.startsWith('blob:')) return url
  // 已有查询参数时保留，否则追加 param
  if (!url.includes('?')) return `${url}?param=${size}y${size}`
  return url
}
