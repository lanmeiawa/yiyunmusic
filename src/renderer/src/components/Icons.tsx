import React from 'react'

type P = { size?: number; className?: string; style?: React.CSSProperties; fill?: string }
const base = (size = 20) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
})

export const IconMusic = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
)

export const IconHome = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
)

export const IconList = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none" />
  </svg>
)

export const IconHeart = ({ size, className, style, fill }: P) => (
  <svg {...base(size)} className={className} style={style} fill={fill || 'none'}>
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
  </svg>
)

export const IconSearch = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

export const IconPlay = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style} fill="currentColor" stroke="none">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
)

export const IconPause = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style} fill="currentColor" stroke="none">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
)

export const IconPrev = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style} fill="currentColor" stroke="none">
    <path d="M7 6v12" stroke="currentColor" strokeWidth="2" />
    <path d="M19 5.5v13l-10-6.5z" />
  </svg>
)

export const IconNext = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style} fill="currentColor" stroke="none">
    <path d="M17 6v12" stroke="currentColor" strokeWidth="2" />
    <path d="M5 5.5v13l10-6.5z" />
  </svg>
)

export const IconVolume = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 6a8.5 8.5 0 0 1 0 12" />
  </svg>
)

export const IconLoop = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11V9a3 3 0 0 1 3-3h15" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v2a3 3 0 0 1-3 3H3" />
  </svg>
)

export const IconShuffle = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M16 3h5v5" />
    <path d="M4 20 21 3" />
    <path d="M21 16v5h-5" />
    <path d="m15 15 6 6" />
    <path d="M4 4l5 5" />
  </svg>
)

export const IconSingle = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11V9a3 3 0 0 1 3-3h15" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    <text x="11" y="16" fontSize="9" fill="currentColor" stroke="none" fontWeight="700">1</text>
  </svg>
)

export const IconLyrics = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M4 6h16M4 11h11M4 16h16M4 21h8" />
  </svg>
)

export const IconMinimize = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M5 12h14" />
  </svg>
)

export const IconMaximize = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <rect x="5" y="5" width="14" height="14" rx="1.5" />
  </svg>
)

export const IconClose = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const IconChevronLeft = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="m15 6-6 6 6 6" />
  </svg>
)

export const IconUser = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
)

export const IconVip = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style} fill="currentColor" stroke="none">
    <path d="M3 7l4.5 3L12 5l4.5 5L21 7l-2 11H5L3 7z" />
  </svg>
)

export const IconClock = ({ size, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export function IconPalette({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9.2" />
      <circle cx="8.2" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15.8" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 21c-1.2-2.6 0.6-4.2 2.4-4.2h2.4c1.8 0 2.4-1.4 1.6-2.8" />
    </svg>
  )
}

export function IconRate({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12h5l2.5-6 3 12 2.5-6h2" />
    </svg>
  )
}

export function IconDownload({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4.5 19.5h15" />
    </svg>
  )
}

export function IconQueue({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h9" />
      <path d="M18 14v6M21 17h-6" />
    </svg>
  )
}

export function IconFM({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="9" width="18" height="10" rx="2" />
      <circle cx="8.5" cy="14" r="2.2" />
      <path d="M16 12.5h2M16 15.5h2" />
      <path d="M6 9l4-4M18 9l-4-4" />
    </svg>
  )
}

export function IconComment({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z" />
    </svg>
  )
}
