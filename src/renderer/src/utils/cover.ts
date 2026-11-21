import type React from 'react'

/** 规范化网易云封面地址：保留原协议（避免 https CDN 在部分网络环境下的证书兼容问题），附加尺寸参数节省带宽 */
export function coverUrl(url?: string, size = 300): string {
  if (!url) return ''
  // 已有查询参数时保留，否则追加 param
  if (!url.includes('?')) return `${url}?param=${size}y${size}`
  return url
}

/** 图片加载失败时的统一降级：隐藏破图，露出父元素的占位纹理/渐变 */
export function onImgError(e: React.SyntheticEvent<HTMLImageElement>): void {
  const el = e.currentTarget
  if (el) el.style.display = 'none'
}
