export interface Profile {
  userId: number
  nickname: string
  avatarUrl: string
  vipType: number
  vipLevel?: number
}

export type ThemeName = 'light' | 'dark' | 'mitia' | 'custom' | 'retro'

/** UI 布局：经典（左栏+主区+底栏）/ 沉浸（全屏歌词与可视化）/ 杂志（大封面卡片流） */
export type LayoutName = 'classic' | 'immersive' | 'magazine'

/** 视图名（含在线收音机，radio 为听书电台） */
export type ViewName =
  | 'discover' | 'playlist' | 'lyrics' | 'search' | 'history'
  | 'settings' | 'radio' | 'profile' | 'local' | 'onlineRadio' | 'fm'

/** 在线收音机频道（Radio Browser 数据源） */
export interface RadioStation {
  stationuuid: string
  name: string
  url: string
  urlResolved: string
  favicon: string
  country: string
  countryCode: string
  state: string
  language: string
  tags: string[]
  codec: string
  bitrate: number
  votes: number
  clickCount: number
}

/** 收音机实时转写文本（像歌词一样逐条滚动） */
export interface RadioTranscript {
  id: number
  text: string
  time: number
}

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

/** 个性化设置（与主进程 store.ts 定义保持一致） */
export interface Customization {
  bgPath?: string
  bgAll: boolean
  blur: number
  dim: number
  primary: string
  sidebarCollapsed: boolean
  playbackRate: number
  showTranslation: boolean
  sleepTimerMin: number
  downloadDir?: string
  flacToMp3: boolean
  downloadQuality: string
  appName: string
  welcomeColor: string
  soundFx: string
  lyricsFontSize: number
  iconPath?: string
  /** 10 段均衡器增益（dB） */
  eqBands?: number[]
  /** 均衡器预设名，custom 表示手动调节 */
  eqPreset: string
  /** 可视化形状：bars/circle/cube/sphere/wave */
  visualShape: string
  /** 可视化灵敏度 0.5-2 */
  visualSensitivity: number
  /** 音乐可视化总开关 */
  visualizerEnabled: boolean
  /** 均衡器开关（关闭时旁通） */
  eqEnabled: boolean
  /** GPU 硬件加速开关（重启生效） */
  gpuAcceleration: boolean
  /** 自定义全局快捷键 */
  shortcuts: ShortcutMap
  /** 搜索历史（最近在前，最多 12 条） */
  searchHistory: string[]
  /** 界面语言 zh / en */
  language: 'zh' | 'en'
  /** 首次启动免责声明已确认 */
  disclaimerAccepted: boolean
  /** UI 布局风格 */
  layout: LayoutName
  /** 收音机转写：是否启用本地语音识别 */
  radioTranscript: boolean
  /** 收音机转写：模型是否就绪（随安装包分发） */
  radioModelReady?: boolean
  /** 开机自启 */
  autoLaunch: boolean
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
  searchHistory: [],
  language: 'zh',
  disclaimerAccepted: false,
  layout: 'classic',
  radioTranscript: false,
  radioModelReady: false,
  autoLaunch: false
}

export interface DesktopLyricsSettings {
  enabled: boolean
  locked: boolean
  opacity: number
  fontSize: number
  color?: string
  x?: number
  y?: number
}

export interface StoreState {
  profile: Profile | null
  volume: number
  playHistory: number[]
  isLoggedIn: boolean
  theme: ThemeName
  desktopLyrics: DesktopLyricsSettings
}

export interface Playlist {
  id: number
  name: string
  coverImgUrl: string
  trackCount: number
  playCount?: number
  description?: string
  creator?: { nickname: string }
  specialType?: number
}

export interface Artist {
  id: number
  name: string
}

export interface Album {
  id: number
  name: string
  picUrl: string
}

export interface Track {
  id: number
  name: string
  artists: Artist[]
  album: Album
  duration: number
  fee?: number // 0 免费 1 VIP 2 付费
  mv?: number
  alias?: string[]
  /** 电台节目：音源走 song_url（v1 不支持电台节目） */
  dj?: boolean
  /** 本地音乐文件（绝对路径，播放走 file:// 不走接口） */
  localPath?: string
  /** 在线收音机流地址（无时长概念，播放走本地代理） */
  streamUrl?: string
}

export interface WordToken {
  text: string
  time: number // 该字/词开始时间（秒）
  end: number  // 该字/词结束时间（秒）
}

export interface LyricLine {
  time: number // 秒
  end?: number // 该行结束时间（秒）
  text: string
  translation?: string
  words?: WordToken[] // 逐字时间轴（klyric 解析，若可用）
}

export interface QualityOption {
  level: string
  label: string
  sub: string
  vip: boolean
}

export const QUALITY_OPTIONS: QualityOption[] = [
  { level: 'standard', label: '标准', sub: '128kbps', vip: false },
  { level: 'higher', label: '较高', sub: '192kbps', vip: false },
  { level: 'exhigh', label: '极高', sub: '320kbps', vip: false },
  { level: 'lossless', label: '无损', sub: 'FLAC', vip: true },
  { level: 'hires', label: 'Hi-Res', sub: '高解析', vip: true },
  { level: 'jymaster', label: '母带', sub: '超清母带', vip: true }
]

export interface SongUrlResult {
  id: number
  url: string
  level?: string
  br?: number
  type?: string
  size?: number
  fee?: number
  freeTrialInfo?: any
  payed?: boolean
  unavailable?: boolean
  reason?: string
}

/** 已保存的账号（不含 cookie） */
export interface AccountItem {
  id: string
  nickname: string
  avatarUrl: string
  vipType: number
  addedAt: number
}

/** 实时探测到的单档音质结果 */
export interface QualityProbe {
  level: string
  actualLevel: string
  available: boolean
  url?: string
  br?: number
  type?: string
  size?: number
  fee?: number
  payed?: boolean
  trial?: boolean
}

/** 下载音质选择弹窗状态 */
export interface DownloadDialog {
  track: Track
  loading: boolean
  probes: QualityProbe[]
  /** 探测失败或降级时的提示 */
  error?: string
  /** 正在获取音源/写入文件 */
  downloading?: boolean
}

export interface CommentItem {
  id: number
  user: string
  avatar: string
  content: string
  time: string
  likes: number
}

export interface LyricSearchItem {
  id: number
  name: string
  artists: string
  snippet: string
}

export interface RadioInfo {
  id: number
  name: string
  picUrl: string
  programCount: number
  category: string
}

export interface RadioCategory {
  categoryId: number
  categoryName: string
  radios: RadioInfo[]
}
