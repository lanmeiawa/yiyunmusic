import React from 'react'

type P = { size?: number; className?: string; style?: React.CSSProperties }
const base = (size = 20) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const
})

export const IconFire = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style} fill="currentColor" stroke="none">
    <path d="M13.5 2c.5 3-1.2 4.6-2.6 6C9.2 9.6 8 11 8 13.5a5.5 5.5 0 0 0 11 0c0-2.2-1-3.8-2.2-5.2.1 1.6-.7 2.7-1.7 3.2.3-3.4-1.2-6.5-1.6-9.5Z" />
    <path d="M10.5 21a3.5 3.5 0 0 0 7 0c0-1.5-.8-2.6-1.7-3.5.2 1.4-.6 2.3-1.3 2.7.1-1.6-.7-2.8-1.5-3.6.1 2-1.2 2.9-2.5 4.4Z" opacity="0.55" />
  </svg>
)

export const IconSun = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)

export const IconMoon = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
)

export const IconStar = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style} fill="currentColor" stroke="none">
    <path d="m12 2 2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.2 6 20.3l1.3-6.7-5-4.6 6.8-.8L12 2Z" />
  </svg>
)

export const IconPalette = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-1.3-1-1.7-1-2.8 0-.9.7-1.5 1.6-1.5H16a5 5 0 0 0 5-5c0-4-4-7-9-7Z" />
    <circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="10" cy="7" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="7.5" r="1" fill="currentColor" stroke="none" />
  </svg>
)

export const IconMonitor = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <rect x="2" y="4" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 18v3" />
  </svg>
)
