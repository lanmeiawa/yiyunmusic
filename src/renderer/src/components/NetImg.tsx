import React, { useEffect, useRef, useState } from 'react'

const memo = new Map<string, string>()

interface Props {
  src: string
  alt?: string
  className?: string
  style?: React.CSSProperties
}

/**
 * 封面图片组件（两级加载）：
 * 1. 直连加载（多数情况直接成功）
 * 2. 失败时经主进程代理下载（带 Referer/UA，绕过渲染层网络限制），结果缓存
 * 3. 仍失败则不渲染 img，露出父元素的占位纹理/渐变
 */
export default function NetImg({ src, alt = '', className, style }: Props) {
  const [current, setCurrent] = useState<string>(src || '')
  const tried = useRef(false)

  useEffect(() => {
    tried.current = false
    setCurrent(src || '')
  }, [src])

  if (!current) return null

  const handleError = async () => {
    if (tried.current || !src) { setCurrent(''); return }
    tried.current = true
    let data = memo.get(src)
    if (!data) {
      data = (await window.eApi.imageProxy(src).catch(() => '')) || ''
      if (data) {
        if (memo.size > 300) memo.clear()
        memo.set(src, data)
      }
    }
    setCurrent(data || '')
  }

  return <img loading="lazy" src={current} alt={alt} className={className} style={style} onError={handleError} />
}
