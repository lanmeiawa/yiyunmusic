import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface Profile {
  userId: number
  nickname: string
  avatarUrl: string
  vipType: number
  vipLevel?: number
}

export type ThemeName = 'light' | 'dark' | 'mitia' | 'custom' | 'retro'

/** 全局快捷键映射（Electron accelerator 格式） */
export interface ShortcutMap {
  togglePlay: string
  next: string
  prev: string
  volumeUp: string
  volumeDown: string
  lockLyrics: string
}

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  togglePlay: 'Control+Alt+P',
  next: 'Control+Alt+Right',
  prev: 'Control+Alt+Left',
  volumeUp: 'Control+Alt+Up',
  volumeDown: 'Control+Alt+Down',
  lockLyrics: 'Control+Alt+L'
}

/** 个性化设置：自定义背景 / 配色 / 布局 / 播放偏好 */
export interface Customization {
  /** 自定义主题背景图（userData 内的绝对路径） */
  bgPath?: string
  /** 背景图应用到所有主题（否则仅自定义主题生效） */
  bgAll: boolean
  /** 背景模糊度 px 0-30 */
  blur: number
  /** 背景遮罩暗度 0-0.8 */
  dim: number
  /** 自定义主色（hex），空串表示跟随所选主题 */
  primary: string
  /** 侧边栏折叠（紧凑图标模式） */
  sidebarCollapsed: boolean
  /** 播放倍速 0.5-2 */
  playbackRate: number
  /** 歌词翻译显示 */
  showTranslation: boolean
  /** 睡眠定时（分钟，0=关闭） */
  sleepTimerMin: number
  /** 下载目录（空=默认 下载/亦云音乐） */
  downloadDir?: string
  /** 下载无损(FLAC)自动转 MP3 */
  flacToMp3: boolean
  /** 下载音质：standard/exhigh/lossless */
  downloadQuality: string
  /** 自定义应用名（空=亦云音乐） */
  appName: string
  /** 主页欢迎语颜色（hex，空=跟随主题） */
  welcomeColor: string
  /** 音效预设：off/bass/vocal/live */
  soundFx: string
  /** 歌词页字号（px） */
  lyricsFontSize: number
  /** 自定义应用图标（userData 内的绝对路径） */
  iconPath?: string
  /** 10 段均衡器增益（dB） */
  eqBands?: number[]
  /** 均衡器预设名 */
  eqPreset: string
  /** 可视化形状：bars/circle/cube/sphere/wave */
  visualShape: string
  /** 可视化灵敏度 */
  visualSensitivity: number
  /** 音乐可视化总开关（关闭时不启动渲染循环） */
  visualizerEnabled: boolean
  /** 10 段均衡器开关（关闭时全部频段旁通为 0dB） */
  eqEnabled: boolean
  /** GPU 硬件加速开关（需重启应用生效） */
  gpuAcceleration: boolean
  /** 自定义全局快捷键 */
  shortcuts: ShortcutMap
  /** 搜索历史（最近在前，最多 12 条） */
  searchHistory: string[]
}

export const DEFAULT_CUSTOMIZATION: Customization = {
  bgAll: false,
  blur: 12,
  dim: 0.45,
  primary: '',
  sidebarCollapsed: false,
  playbackRate: 1,
  showTranslation: true,
  sleepTimerMin: 0,
  flacToMp3: false,
  downloadQuality: 'exhigh',
  appName: '',
  welcomeColor: '',
  soundFx: 'off',
  lyricsFontSize: 26,
  eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  eqPreset: 'off',
  visualShape: 'bars',
  visualSensitivity: 1.6,
  visualizerEnabled: true,
  eqEnabled: true,
  gpuAcceleration: true,
  shortcuts: { ...DEFAULT_SHORTCUTS },
  searchHistory: []
}

/** 主窗口位置与大小记忆 */
export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

export interface StoreShape {
  cookie: string
  profile: Profile | null
  volume: number
  playHistory: number[]
  theme: ThemeName
  quality: string
  desktopLyrics: DesktopLyricsSettings
  customization: Customization
  windowBounds?: WindowBounds
}

const DEFAULT: StoreShape = {
  cookie: '',
  profile: null,
  volume: 0.8,
  playHistory: [],
  theme: 'light',
  quality: 'exhigh',
  desktopLyrics: {
    enabled: false,
    locked: false,
    opacity: 0.85,
    fontSize: 28
  },
  customization: { ...DEFAULT_CUSTOMIZATION }
}

let cache: StoreShape = { ...DEFAULT }

function file(): string {
  return path.join(app.getPath('userData'), 'yiyun-store.json')
}

export function initStore(): void {
  try {
    const p = file()
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8')
      const parsed = JSON.parse(raw)
      cache = {
        ...DEFAULT,
        ...parsed,
        desktopLyrics: { ...DEFAULT.desktopLyrics, ...(parsed.desktopLyrics || {}) },
        customization: { ...DEFAULT_CUSTOMIZATION, ...(parsed.customization || {}) }
      }
    }
  } catch (e) {
    console.error('[store] 读取失败，使用默认值', e)
    cache = { ...DEFAULT }
  }
}

export function saveStore(): void {
  try {
    const p = file()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(cache, null, 2), 'utf-8')
  } catch (e) {
    console.error('[store] 保存失败', e)
  }
}

export function getStore(): StoreShape {
  return cache
}

export function setCookie(cookie: string): void {
  cache.cookie = cookie
  saveStore()
}

export function getCookie(): string {
  return cache.cookie
}

export function setProfile(profile: Profile | null): void {
  cache.profile = profile
  saveStore()
}

export function setVolume(volume: number): void {
  cache.volume = volume
  saveStore()
}

export function pushHistory(id: number): void {
  cache.playHistory = [id, ...cache.playHistory.filter((x) => x !== id)].slice(0, 100)
  saveStore()
}

export function setTheme(theme: ThemeName): void {
  cache.theme = theme
  saveStore()
}

export function setQuality(quality: string): void {
  cache.quality = quality
  saveStore()
}

export function setDesktopLyrics(patch: Partial<DesktopLyricsSettings>): DesktopLyricsSettings {
  cache.desktopLyrics = { ...cache.desktopLyrics, ...patch }
  saveStore()
  return cache.desktopLyrics
}

export function setCustomization(patch: Partial<Customization>): Customization {
  cache.customization = { ...cache.customization, ...patch }
  saveStore()
  return cache.customization
}

export function setWindowBounds(b: WindowBounds): void {
  cache.windowBounds = b
  saveStore()
}

export function clearSession(): void {
  cache.cookie = ''
  cache.profile = null
  saveStore()
}

/**
 * NeteaseCloudMusicApi 返回的 cookie 是 Set-Cookie 字符串数组，
 * 形如 ['MUSIC_U=xxx; Path=/; ...', '__csrf=yyy; Path=/; ...']
 * 这里抽取 key=value 并合并进已有 cookie。
 */
export function mergeCookie(current: string, incoming: any): string {
  const jar = new Map<string, string>()
  const eat = (str: string) => {
    str.split(';').forEach((part) => {
      const idx = part.indexOf('=')
      if (idx <= 0) return
      const key = part.slice(0, idx).trim()
      const val = part.slice(idx + 1).trim()
      if (!key) return
      // 忽略过期/删除的 cookie
      if (/expires=Thu, 01 Jan 1970/i.test(part) || val === '') {
        jar.delete(key)
        return
      }
      jar.set(key, val)
    })
  }

  eat(current)
  if (Array.isArray(incoming)) {
    incoming.forEach((c) => eat(String(c)))
  } else if (typeof incoming === 'string') {
    eat(incoming)
  } else if (incoming && typeof incoming === 'object') {
    Object.values(incoming).forEach((c) => eat(String(c)))
  }

  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}
