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
  /** 该条文本对应的音频时间（秒），用于滚动定位 */
  time?: number
}

/** 听书电台（网易云 dj 分类下的电台） */
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
  /** 自定义主题背景图（userData 内的绝对路径） */
  bgPath?: string
  /** 背景图应用到所有主题 */
  bgAll: boolean
  /** 背景模糊度 px 0-30 */
  blur: number
  /** 背景遮罩暗度 0-0.8 */
  dim: number
  /** 自定义主色（hex），空串表示跟随所选主题 */
  primary: string
  /** 播放倍速 0.5-2 */
  playbackRate: number
  /** 歌词翻译显示 */
  showTranslation: boolean
  /** 睡眠定时（分钟，0=关闭） */
  sleepTimerMin: number
  /** 下载目录（空=默认 下载/yiyunmusic） */
  downloadDir?: string
  /** 下载无损(FLAC)自动转 MP3 */
  flacToMp3: boolean
  /** 下载音质：standard/exhigh/lossless */
  downloadQuality: string
  /** 自定义应用名（空=yiyunmusic） */
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
  /** 界面语言 zh / en */
  language: 'zh' | 'en'
  /** 首次启动免责声明已确认 */
  disclaimerAccepted?: boolean
  /** UI 布局风格 */
  layout?: LayoutName
  /** 收音机转写：是否启用本地语音识别 */
  radioTranscript?: boolean
  /** 收音机转写：模型是否就绪 */
  radioModelReady?: boolean
  /** 开机自启 */
  autoLaunch?: boolean
  /** 备用接口地址（自建 NeteaseCloudMusicApi） */
  apiBackupUrl?: string
}

export const DEFAULT_CUSTOMIZATION: Customization = {
  bgAll: false,
  blur: 12,
  dim: 0.45,
  primary: '',
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
  autoLaunch: false,
  apiBackupUrl: ''
}

/** 桌面歌词悬浮窗设置 */
export interface DesktopLyricsSettings {
  enabled: boolean
  locked: boolean
  opacity: number
  fontSize: number
  color?: string
  x?: number
  y?: number
  width?: number
  height?: number
  /** 文本对齐方式 */
  align?: 'left' | 'center' | 'right'
  /** 屏幕位置锚点：tl/tc/tr/ml/mc/mr/bl/bc/br/free */
  anchor?: string
  /** 背景不透明度 0~1，0 表示完全隐藏背景 */
  bgOpacity?: number
  /** 文字描边，背景透明时保证可读 */
  outline?: boolean
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
}

export interface WordToken {
  text: string
  time: number // 该字/词开始时间（秒）
  end: number // 该字/词结束时间（秒）
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
  liked?: boolean
}

export interface LyricSearchItem {
  id: number
  name: string
  artists: string
  snippet: string
}
