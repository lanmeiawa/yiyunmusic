import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type {
  Profile, Playlist, Track, SongUrlResult, LyricLine, ThemeName, DesktopLyricsSettings,
  RadioStation, RadioTranscript
} from './types'
import { parseLyric, findActiveIndex, computeWordProgress } from './utils/lrc'
import { DEFAULT_CUSTOMIZATION, type Customization } from './types'
import { mixHex, hexToRgba } from './utils/color'
function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0 }
  return h
}

/** 本地文件 → Track：文件名按「歌名 - 歌手」拆分 */
function toLocalTrack(f: { path: string; name: string; size: number }) {
  const m = f.name.split(/-|—/)
  const title = (m[0] || f.name).trim()
  const artist = (m[1] || '本地音乐').trim()
  return {
    id: Math.abs(hashCode(f.path)),
    name: title,
    artists: [{ id: 0, name: artist }],
    album: { id: 0, name: '本地音乐', picUrl: '' },
    duration: 0,
    fee: 0,
    mv: 0,
    alias: [] as string[],
    localPath: f.path
  }
}
import type { CommentItem, RadioCategory, RadioInfo, LyricSearchItem, DownloadDialog, QualityProbe, AccountItem } from './types'
import { translate, type Locale } from './i18n'
import { coverUrl } from './utils/cover'
import { probeLabel, formatSize, levelLabel } from './utils/quality'
import { EQ_PRESETS, ensureGraph, configureEq, setEqEnabled, startPcmCapture, stopPcmCapture, hasAudioGraph } from './utils/audioGraph'

interface PlayerState {
  current: Track | null
  isPlaying: boolean
  duration: number
  currentTime: number
  volume: number
  playlist: Track[]
  playMode: 'loop' | 'single' | 'shuffle'
}

interface AppContextValue {
  // 登录
  profile: Profile | null
  isLoggedIn: boolean
  authReady: boolean
  loginOpen: boolean
  disclaimerOpen: boolean
  acceptDisclaimer: () => void
  declineDisclaimer: () => void
  openLogin: () => void
  setProfile: (p: Profile | null) => void
  logout: () => Promise<void>

  // 歌单
  playlists: Playlist[]
  currentPlaylistId: number | null
  loadPlaylists: () => Promise<void>
  openPlaylist: (id: number) => Promise<void>
  openArtist: (id: number, name: string) => Promise<void>
  openAlbum: (id: number, name: string) => Promise<void>
  tracks: Track[]
  playlistName: string
  playlistLoading: boolean

  // 播放器
  player: PlayerState
  playTrack: (track: Track, list?: Track[]) => Promise<void>
  togglePlay: () => void
  nextTrack: () => void
  prevTrack: () => void
  seek: (time: number) => void
  setVolume: (v: number) => void
  setPlayMode: (m: PlayerState['playMode']) => void

  // 歌词
  lyricLines: LyricLine[]
  songUrlLoading: boolean
  message: string
  setMessage: (m: string) => void

  // 音质
  quality: string
  setQuality: (level: string) => void
  currentQuality: string // 当前歌曲实际拿到的音质
  currentQualityInfo: SongUrlResult | null // 接口返回的等级/码率/格式/大小

  // 视图
  view: 'discover' | 'playlist' | 'lyrics' | 'search' | 'history' | 'settings' | 'radio' | 'profile' | 'local' | 'onlineRadio' | 'fm'
  setView: (v: 'discover' | 'playlist' | 'lyrics' | 'search' | 'history' | 'settings' | 'radio' | 'profile' | 'local' | 'onlineRadio' | 'fm') => void

  // 在线收音机
  radioStations: RadioStation[]
  netRadioLoading: boolean
  radioQuery: { mode: string; keyword: string; countryCode: string; tag: string }
  setRadioQuery: (patch: Partial<{ mode: string; keyword: string; countryCode: string; tag: string }>) => void
  loadRadioStations: () => Promise<void>
  radioCountries: string[]
  radioTags: string[]
  currentStation: RadioStation | null
  playRadioStation: (s: RadioStation) => Promise<void>
  stopRadio: () => void
  // 收音机实时转写
  transcripts: RadioTranscript[]
  transcriptActive: boolean
  setTranscriptActive: (v: boolean) => void

  // 沉浸全屏：仅保留歌词或可视化内容
  immersive: boolean
  setImmersive: (v: boolean) => void

  // 个性化设置
  customization: Customization
  setCustomization: (patch: Partial<Customization>) => Promise<void>
  chooseBg: () => Promise<void>
  bgData: string

  // 收藏与歌单管理
  toggleLike: (track: Track) => Promise<void>
  isLiked: (id?: number) => boolean
  addToPlaylist: (playlistId: number, track: Track) => Promise<void>
  createPlaylist: (name: string) => Promise<number | null>
  deletePlaylist: (id: number) => Promise<boolean>
  // 歌单批量操作
  batchDownload: (tracks: Track[]) => Promise<void>
  batchLike: (tracks: Track[]) => Promise<void>
  batchAddToPlaylist: (playlistId: number, tracks: Track[]) => Promise<void>
  batchRemoveFromPlaylist: (playlistId: number, ids: number[]) => Promise<void>

  // 下载（先实时探测可用音质，再弹窗确认）
  downloadTrack: (track: Track) => Promise<void>
  downloadDialog: DownloadDialog | null
  confirmDownload: (probe: QualityProbe) => Promise<void>
  closeDownload: () => void

  // 私人FM
  fmMode: boolean
  fmTracks: Track[]
  fmLoading: boolean
  fmNext: () => Promise<void>
  openFm: () => Promise<void>
  loadFm: (append?: boolean) => Promise<Track[]>
  playFmTrack: (track: Track) => Promise<void>

  // 热门评论（当前歌曲）
  comments: CommentItem[]
  loadComments: (id: number) => Promise<void>
  postComment: (id: number, content: string) => Promise<boolean>

  // 听书电台
  radioPrograms: Track[]
  radioLoading: boolean
  radios: RadioInfo[]
  radiosLoading: boolean
  loadRadios: () => Promise<void>
  loadRadioPrograms: (radioId: number) => Promise<void>
  activeRadio: RadioInfo | null
  setActiveRadio: (r: RadioInfo | null) => void
  radioCats: RadioCategory[]
  activeCat: number
  setActiveCat: (id: number) => void
  loadRadioCats: (retry?: boolean) => Promise<void>
  aggCats: string[]

  // 本地音乐
  localTracks: Track[]
  localLoading: boolean
  scanLocal: () => Promise<void>
  openLocalFiles: () => Promise<void>

  // 历史播放
  historyTracks: Track[]
  loadHistory: () => Promise<void>

  // 主题
  theme: ThemeName
  setTheme: (t: ThemeName) => void

  // 桌面歌词
  desktopLyrics: DesktopLyricsSettings
  toggleDesktopLyrics: () => Promise<void>
  updateDesktopLyrics: (patch: Partial<DesktopLyricsSettings>) => Promise<void>

  // 搜索
  searchKeyword: string
  loadSearchSection: (kind: 'albums' | 'shows' | 'lyrics') => Promise<void>
  searchResults: { songs: Track[]; playlists: Playlist[]; shows?: Track[]; albums?: any[]; artists?: any[]; lyricHits?: LyricSearchItem[] }
  searching: boolean
  searchError: string
  doSearch: (keyword: string) => Promise<void>
  // 多账号
  accounts: AccountItem[]
  switchAccount: (id: string) => Promise<boolean>
  removeAccount: (id: string) => Promise<void>
  refreshAccounts: () => Promise<void>
  // 多语言
  locale: Locale
  t: (key: string, vars?: Record<string, string | number>) => string
  // 搜索历史
  searchHistory: string[]
  clearSearchHistory: () => void
  removeSearchHistory: (kw: string) => void
}

/** 把网络层的技术错误翻成人话，避免界面上出现 TypeError: terminated 这类字符串 */
function friendlyNetError(msg: string): string {
  const m = String(msg || '')
  if (!m) return ''
  if (/terminated|premature|socket hang up|econnreset|aborted|body stream|other side closed/i.test(m)) {
    return '网络连接中断，请稍后重试'
  }
  if (/操作频繁|请求过于频繁|too many requests|rate limit/i.test(m)) {
    return '搜索有点频繁，等几秒再试'
  }
  return m
}

const Ctx = createContext<AppContextValue>(null as any)
export const useApp = () => useContext(Ctx)

const audio = typeof Audio !== 'undefined' ? Object.assign(new Audio(), { preload: 'auto' }) : (null as any)
// 便于调试与自动化测试访问播放器内核
if (typeof window !== 'undefined') (window as any).__audio = audio

/**
 * 音频图按需建立：可视化与均衡器都关闭时不创建 Web Audio 链，
 * 让音频走浏览器原生输出路径，省去 10 段滤波 + FFT 的持续开销。
 */
function syncAudioGraph(c: Customization | undefined) {
  if (!audio || !c) return false
  if (!c.eqEnabled && !c.visualizerEnabled) return false
  if (!ensureGraph(audio)) return false
  setEqEnabled(c.eqEnabled !== false)
  configureEq(c.eqBands)
  return true
}

// 旧版三段音效名 → 新版 10 段预设的兼容映射
const LEGACY_FX: Record<string, string> = { off: 'off', bass: 'bass', vocal: 'vocal', live: 'rock' }

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfileState] = useState<Profile | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [disclaimerOpen, setDisclaimerOpen] = useState(false)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [currentPlaylistId, setCurrentPlaylistId] = useState<number | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [playlistName, setPlaylistName] = useState('')
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([])
  // 歌词请求序号：只接受最后一次请求的结果（防止快速切歌时旧歌词覆盖新歌词）
  const lyricSeqRef = useRef(0)
  const [songUrlLoading, setSongUrlLoading] = useState(false)
  const [message, setMessageState] = useState('')
  const [view, setView] = useState<'discover' | 'playlist' | 'lyrics' | 'search' | 'history' | 'settings' | 'radio' | 'profile' | 'local' | 'onlineRadio' | 'fm'>('discover')
  // 在线收音机状态
  const [radioStations, setRadioStations] = useState<RadioStation[]>([])
  const [netRadioLoading, setNetRadioLoading] = useState(false)
  const [radioQuery, setRadioQueryState] = useState({ mode: 'top', keyword: '', countryCode: 'CN', tag: '' })
  const [radioCountries, setRadioCountries] = useState<string[]>([])
  const [radioTags, setRadioTags] = useState<string[]>([])
  const [currentStation, setCurrentStation] = useState<RadioStation | null>(null)
  const [transcripts, setTranscripts] = useState<RadioTranscript[]>([])
  const [transcriptActive, setTranscriptActive] = useState(false)
  const transcriptActiveRef = useRef(false)
  transcriptActiveRef.current = transcriptActive
  const [theme, setThemeState] = useState<ThemeName>('light')
  const [quality, setQualityState] = useState<string>('exhigh')
  const [currentQuality, setCurrentQuality] = useState<string>('exhigh')
  // 接口实际返回的音源信息（等级/码率/格式/大小），用于展示真实音质
  const [currentQualityInfo, setCurrentQualityInfo] = useState<SongUrlResult | null>(null)
  const [desktopLyrics, setDesktopLyricsState] = useState<DesktopLyricsSettings>({
    enabled: false, locked: false, opacity: 0.85, fontSize: 28
  })
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchError, setSearchError] = useState('')
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [searchResults, setSearchResults] = useState<{ songs: Track[]; playlists: Playlist[]; shows?: Track[]; albums?: any[]; artists?: any[]; lyricHits?: LyricSearchItem[] }>({
    songs: [], playlists: []
  })
  const [searching, setSearching] = useState(false)
  // 搜索补充分区（专辑/听书/歌词）按需加载
  const searchKeywordRef = useRef('')
  searchKeywordRef.current = searchKeyword
  const searchExtraRef = useRef<{ kw: string; loaded: Set<string> }>({ kw: '', loaded: new Set() })
  const [historyTracks, setHistoryTracks] = useState<Track[]>([])
  const [customization, setCustomizationState] = useState<Customization>(DEFAULT_CUSTOMIZATION)
  // 多语言
  const locale = (customization.language || 'zh') as Locale
  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale])
  const [bgData, setBgData] = useState('')
  const [immersive, setImmersiveState] = useState(false)
  const msgTimer = useRef<any>(null)
  const customizationRef = useRef(customization)
  customizationRef.current = customization

  const [player, setPlayer] = useState<PlayerState>({
    current: null,
    isPlaying: false,
    duration: 0,
    currentTime: 0,
    volume: 0.8,
    playlist: [],
    playMode: 'loop'
  })

  const playerRef = useRef(player)
  playerRef.current = player
  const playModeRef = useRef(player.playMode)
  playModeRef.current = player.playMode

  const setMessage = useCallback((m: string) => {
    setMessageState(m)
    if (msgTimer.current) clearTimeout(msgTimer.current)
    if (m) msgTimer.current = setTimeout(() => setMessageState(''), 3200)
  }, [])

  // 沉浸全屏：同步切换系统窗口全屏状态
  const setImmersive = useCallback((v: boolean) => {
    setImmersiveState(v)
    try { window.eApi.win.setFullScreen(v) } catch { /* 非 Electron 环境忽略 */ }
  }, [])

  // 系统级退出全屏（Esc 被 Chromium 消费时）也要同步移除沉浸布局
  useEffect(() => {
    const off = window.eApi.win.onFullscreenLeft(() => setImmersiveState(false))
    return off
  }, [])

  // 离开歌词页时自动退出沉浸模式，避免其他页面被隐藏控件影响
  useEffect(() => {
    if (view !== 'lyrics' && immersive) setImmersive(false)
  }, [view, immersive, setImmersive])

  const setProfile = useCallback((p: Profile | null) => {
    setProfileState(p)
  }, [])

  const refreshAccounts = useCallback(async () => {
    try {
      const list = await window.eApi.accountsList()
      setAccounts(Array.isArray(list) ? list : [])
    } catch {
      setAccounts([])
    }
  }, [])

  // 初始化：读取本地登录态
  useEffect(() => {
    ;(async () => {
      let accepted = true
      try {
        const s = await window.eApi.store.get()
        accepted = !!s.customization?.disclaimerAccepted
        if (s.profile && s.isLoggedIn) {
          // 校验登录态是否仍有效
          try {
            const fresh = await window.eApi.profile()
            setProfileState(fresh || s.profile)
          } catch {
            setProfileState(s.profile)
          }
        }
        if (typeof s.volume === 'number') {
          setPlayer((p) => ({ ...p, volume: s.volume }))
          if (audio) audio.volume = s.volume
        }
        // 兼容旧版三段音效设置；新版统一使用 10 段 eqBands
        if (s.customization) {
          const legacy = LEGACY_FX[s.customization.soundFx || 'off'] || 'off'
          const bands = s.customization.eqBands && s.customization.eqBands.length === 10
            ? s.customization.eqBands
            : (EQ_PRESETS[legacy] || EQ_PRESETS.off)
          setEqEnabled(s.customization.eqEnabled !== false)
          configureEq(bands)
          if (!s.customization.eqBands && legacy !== 'off') {
            window.eApi.customSet({ eqBands: bands, eqPreset: legacy }).catch(() => {})
          }
        }
        refreshAccounts()
        if (s.theme) setThemeState(s.theme)
        if (s.quality) setQualityState(s.quality)
        if (s.desktopLyrics) setDesktopLyricsState(s.desktopLyrics)
        if (s.customization) {
          setCustomizationState(s.customization)
          // 已设置过背景图则加载其 dataURL
          if (s.customization.bgPath) {
            window.eApi.customBgData().then((d: string) => setBgData(d || '')).catch(() => {})
          }
        }
      } catch (e) {
        console.error(e)
      } finally {
        setAuthReady(true)
        // 首次启动：未确认免责声明时先弹声明，确认后再进入登录流程
        if (accepted) setLoginOpen(true)
        else setDisclaimerOpen(true)
      }
    })()
  }, [])

  // 登录成功/登出时同步弹窗开关
  useEffect(() => {
    if (profile) setLoginOpen(false)
  }, [profile])

  // 应用主题到 document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // ===== 个性化：CSS 变量注入 =====
  useEffect(() => {
    const root = document.documentElement
    const clear = (...names: string[]) => names.forEach((n) => root.style.removeProperty(n))
    // 自定义主色：覆盖任何主题的主色系
    if (customization.primary) {
      const c = customization.primary
      root.style.setProperty('--primary', c)
      root.style.setProperty('--primary-soft', c)
      root.style.setProperty('--primary-gradient', `linear-gradient(135deg, ${mixHex(c, '#ffffff', 0.35)}, ${c})`)
      root.style.setProperty('--primary-tint', hexToRgba(c, 0.16))
      root.style.setProperty('--shadow-primary', `0 6px 16px ${hexToRgba(c, 0.3)}`)
      root.style.setProperty('--shadow-primary-lg', `0 10px 24px ${hexToRgba(c, 0.4)}`)
    } else {
      clear('--primary', '--primary-soft', '--primary-gradient', '--primary-tint', '--shadow-primary', '--shadow-primary-lg')
    }
    // 主页欢迎语颜色
    if (customization.welcomeColor) {
      root.style.setProperty('--welcome-color', customization.welcomeColor)
    } else {
      root.style.removeProperty('--welcome-color')
    }
    // 自定义主题背景
    if (theme === 'custom') {
      root.style.setProperty('--custom-bg-image', bgData ? `url(${bgData})` : 'none')
      root.style.setProperty('--custom-bg-blur', `${customization.blur}px`)
      root.style.setProperty('--custom-bg-dim', String(customization.dim))
    } else {
      clear('--custom-bg-image', '--custom-bg-blur', '--custom-bg-dim')
    }
  }, [customization, bgData, theme])

  // UI 布局（经典 / 沉浸 / 杂志）→ data-layout 属性驱动 CSS
  useEffect(() => {
    document.documentElement.setAttribute('data-layout', customization.layout || 'classic')
  }, [customization.layout])

  // 开机自启：启动时同步一次系统登录项，之后随开关变化
  useEffect(() => {
    window.eApi.appAutoLaunch?.(!!customization.autoLaunch).catch(() => {})
  }, [customization.autoLaunch])

  // 进入在线收音机：首次拉取列表与分类；查询条件变化时重新搜索
  useEffect(() => {
    if (view !== 'onlineRadio') return
    loadRadioStations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, radioQuery])
  useEffect(() => {
    if (view === 'onlineRadio' && radioCountries.length === 0) loadRadioFacets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // 播放倍速
  useEffect(() => {
    if (audio) audio.playbackRate = Math.max(0.5, Math.min(2, customization.playbackRate || 1))
  }, [customization.playbackRate])

  // 用户首次交互时建立 Web Audio 图（浏览器要求手势才能启动 AudioContext）
  useEffect(() => {
    const onGesture = () => {
      syncAudioGraph(customizationRef.current)
      document.removeEventListener('pointerdown', onGesture)
      document.removeEventListener('keydown', onGesture)
    }
    document.addEventListener('pointerdown', onGesture)
    document.addEventListener('keydown', onGesture)
    return () => {
      document.removeEventListener('pointerdown', onGesture)
      document.removeEventListener('keydown', onGesture)
    }
  }, [])

  // 睡眠定时：到点暂停并复位
  const sleepTimerRef = useRef<any>(null)
  useEffect(() => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current)
    if (customization.sleepTimerMin > 0 && audio) {
      sleepTimerRef.current = setTimeout(() => {
        audio.pause()
        setPlayer((p) => ({ ...p, isPlaying: false }))
        setMessage('睡眠定时已到，播放已停止')
        setCustomizationState((c) => ({ ...c, sleepTimerMin: 0 }))
        window.eApi.customSet({ sleepTimerMin: 0 }).catch(() => {})
      }, customization.sleepTimerMin * 60000)
    }
    return () => clearTimeout(sleepTimerRef.current)
  }, [customization.sleepTimerMin, setMessage])

  // 个性化设置保存
  const setCustomization = useCallback(async (patch: Partial<Customization>) => {
    try {
      const next: Customization = await window.eApi.customSet(patch)
      setCustomizationState(next)
      if (patch.bgPath === '') setBgData('')
      // 均衡器即时切换（用户点击时已有手势，可安全启动 AudioContext）
      if (patch.eqBands !== undefined || patch.eqPreset !== undefined || patch.eqEnabled !== undefined || patch.visualizerEnabled !== undefined) {
        syncAudioGraph(next)
      }
      // 关闭均衡器后立即旁通所有频段；重新开启时恢复数值
      if (patch.eqEnabled !== undefined) setEqEnabled(next.eqEnabled !== false)
    } catch {
      setMessage('个性化设置保存失败')
    }
  }, [setMessage])

  // 选择背景图（成功后自动切到自定义主题）
  const chooseBg = useCallback(async () => {
    const p: string = await window.eApi.customBgSelect()
    if (!p) return
    const data: string = await window.eApi.customBgData()
    setBgData(data || '')
    if (theme !== 'custom') {
      await window.eApi.store.setTheme('custom')
      setThemeState('custom')
      setMessage('自定义主题已启用')
    }
  }, [theme, setMessage])

  // 登录弹窗入口（多处引用，需在此定义，避免 TDZ）
  const openLogin = useCallback(() => setLoginOpen(true), [])

  // 首次启动免责声明：同意后持久化并进入登录流程；不同意则退出应用
  const acceptDisclaimer = useCallback(() => {
    setDisclaimerOpen(false)
    window.eApi.customSet({ disclaimerAccepted: true }).catch(() => {})
    setLoginOpen(true)
  }, [])

  const declineDisclaimer = useCallback(() => {
    window.eApi.win.quit()
  }, [])

  // ===== 收藏与歌单管理 =====
  const [likedIds, setLikedIds] = useState<number[]>([])
  const likedSetRef = useRef<Set<number>>(new Set())

  // 登录后加载「我喜欢的音乐」曲库，驱动收藏按钮的点亮状态
  const loadLiked = useCallback(async () => {
    if (!profile) { setLikedIds([]); likedSetRef.current = new Set(); return }
    try {
      const res = await window.eApi.call('user_playlist', { uid: profile.userId, limit: 30 })
      const likePl = (res?.playlist || []).find((p: any) => p.specialType === 5 || p.creator?.userId === profile.userId && /我喜欢的音乐/.test(p.name || ''))
      if (!likePl) return
      const det = await window.eApi.call('playlist_detail', { id: likePl.id })
      const ids: number[] = (det?.playlist?.trackIds || []).map((t: any) => t.id)
      likedSetRef.current = new Set(ids)
      setLikedIds(ids)
    } catch { /* 收藏状态加载失败不影响主流程 */ }
  }, [profile])

  useEffect(() => { loadLiked() }, [loadLiked])

  // 收藏/取消收藏当前歌曲（网易云「喜欢」双向切换）
  const toggleLike = useCallback(async (track: Track) => {
    if (!profile) {
      setMessage('登录网易云账号后即可收藏歌曲')
      openLogin()
      return
    }
    const liked = likedSetRef.current.has(track.id)
    try {
      const res = await window.eApi.call('like', { id: track.id, like: !liked })
      if (res?.code === 200) {
        if (liked) { likedSetRef.current.delete(track.id); setLikedIds((ids) => ids.filter((i) => i !== track.id)) }
        else { likedSetRef.current.add(track.id); setLikedIds((ids) => [track.id, ...ids]) }
        setMessage(liked ? `已取消收藏「${track.name}」` : `已收藏「${track.name}」到「我喜欢的音乐」`)
      } else {
        setMessage(res?.message || '收藏操作失败')
      }
    } catch (e: any) {
      setMessage(e?.body?.message || '收藏操作失败，请稍后重试')
    }
  }, [profile, openLogin, setMessage])

  const isLiked = useCallback((id?: number) => (id ? likedSetRef.current.has(id) : false), [])

  // 添加歌曲到指定歌单
  const addToPlaylist = useCallback(async (playlistId: number, track: Track) => {
    try {
      const res = await window.eApi.call('playlist_tracks', { pid: playlistId, tracks: String(track.id), op: 'add' })
      if (res?.body?.code === 200 || res?.code === 200) {
        setMessage(`已把「${track.name}」添加到歌单`)
      } else if (res?.body?.code === 502 || res?.code === 502) {
        // 502 常见于「歌单内歌曲重复」
        setMessage(`「${track.name}」已在该歌单中`)
      } else {
        setMessage(res?.body?.message || res?.message || '添加失败')
      }
    } catch (e: any) {
      setMessage(e?.body?.message || e?.message || '添加失败')
    }
  }, [setMessage])

  // 新建歌单（返回新歌单 id，失败返回 null）
  const createPlaylist = useCallback(async (name: string): Promise<number | null> => {
    if (!name.trim()) { setMessage('歌单名不能为空'); return null }
    try {
      const res = await window.eApi.call('playlist_create', { name: name.trim() })
      if (res?.code === 200 && res?.id) {
        setMessage(`歌单「${name.trim()}」创建成功`)
        await loadPlaylists()
        return res.id
      }
      setMessage(res?.message || '创建失败')
      return null
    } catch (e: any) {
      setMessage(e?.body?.message || '创建歌单失败（需要登录）')
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMessage])

  // 删除歌单
  const deletePlaylist = useCallback(async (id: number) => {
    try {
      const res = await window.eApi.call('playlist_delete', { id })
      if (res?.code === 200) {
        setMessage('歌单已删除')
        await loadPlaylists()
        setView('discover')
        return true
      }
      setMessage(res?.message || '删除失败')
      return false
    } catch (e: any) {
      setMessage(e?.body?.message || '删除歌单失败')
      return false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMessage])

  // ===== 下载：先实时探测可用音质，再让用户选择 =====
  const [downloadDialog, setDownloadDialog] = useState<DownloadDialog | null>(null)
  const downloadDialogRef = useRef(downloadDialog)
  downloadDialogRef.current = downloadDialog

  const downloadTrack = useCallback(async (track: Track) => {
    if (!track) return
    setDownloadDialog({ track, loading: true, probes: [] })
    // 兜底：列表查询失败时至少保留一种默认音质，下载时再实时换取真实地址
    const fallback = (): QualityProbe[] => [{
      level: customizationRef.current.downloadQuality || 'exhigh',
      actualLevel: '',
      available: true,
      url: ''
    }]
    try {
      const res: any = await window.eApi.songQualities(track.id)
      const list: QualityProbe[] = Array.isArray(res?.probes) ? res.probes : (Array.isArray(res) ? res : [])
      const probes = list.length ? list : fallback()
      setDownloadDialog({
        track,
        loading: false,
        probes,
        error: list.length
          ? res?.error
          : (res?.error ? `${res.error}，已保留默认音质` : '音质列表获取失败，已保留默认音质')
      })
    } catch (e: any) {
      setDownloadDialog({ track, loading: false, probes: fallback(), error: '音质查询失败，已保留默认音质，下载时会再次确认' })
    }
  }, [])

  const closeDownload = useCallback(() => setDownloadDialog(null), [])

  const confirmDownload = useCallback(async (probe: QualityProbe) => {
    const d = downloadDialogRef.current
    if (!d || !probe) return
    const { track } = d
    setDownloadDialog((cur) => (cur ? { ...cur, downloading: true } : cur))
    try {
      setMessage(`正在获取「${track.name}」的${levelLabel(probe.level)}音源…`)
      // 弹窗列表来自歌曲详情，不含真实地址；这里按所选档位实时换取并确认实际音质
      const urlRes: SongUrlResult | null = await window.eApi.songUrl(track.id, probe.level)
      if (!urlRes?.url) {
        setMessage('该音质暂不可用，请换一档或稍后重试')
        return
      }
      const actual = urlRes.level || probe.level
      const type = urlRes.type || probe.type || 'mp3'
      setMessage(`正在下载「${track.name}」…`)
      const r: any = await window.eApi.downloadSong({
        url: urlRes.url,
        name: track.name,
        artist: track.artists.map((a) => a.name).join('/'),
        type
      })
      if (r?.file) {
        const desc = probeLabel({ ...probe, actualLevel: actual, br: urlRes.br || probe.br, type })
        const downgraded = actual !== probe.level ? '（所选档位不可用，已降级）' : ''
        const tip = r.converted ? '（FLAC 已转 MP3）' : r.warn ? `（${r.warn}）` : ''
        setMessage(`已下载「${track.name}」· ${desc}${formatSize(r.size) ? ' · ' + formatSize(r.size) : ''}${downgraded}${tip}`)
        setDownloadDialog(null)
      } else {
        setMessage(r?.error ? `下载失败：${r.error}` : '下载失败')
      }
    } catch (e: any) {
      setMessage('下载失败：' + (e?.message || '未知错误'))
    } finally {
      setDownloadDialog((cur) => (cur ? { ...cur, downloading: false } : cur))
    }
  }, [setMessage])

  // ===== 私人FM：一次拉 50 首，列表展示，可整批播放 =====
  const [fmMode, setFmMode] = useState(false)
  const [fmTracks, setFmTracks] = useState<Track[]>([])
  const [fmLoading, setFmLoading] = useState(false)
  const fmTracksRef = useRef<Track[]>([])
  fmTracksRef.current = fmTracks
  const fmIdsRef = useRef<Set<number>>(new Set())
  const fmLoadingRef = useRef(false)
  // playTrack 定义在后面，用 ref 打破闭包/依赖顺序问题
  const playTrackRef = useRef<(t: Track, list?: Track[]) => Promise<void>>(async () => {})

  const mapFmTrack = (t: any): Track => ({
    id: t.id,
    name: t.name,
    artists: (t.artists || []).map((a: any) => ({ id: a.id, name: a.name })),
    album: { id: t.album?.id || 0, name: t.album?.name || '', picUrl: t.album?.picUrl || '' },
    duration: t.duration || 0,
    fee: t.fee,
    mv: t.mv,
    alias: t.alias
  })

  /** 拉一批 FM 歌（append=true 时追加到已有列表后面） */
  const loadFm = useCallback(async (append = false): Promise<Track[]> => {
    if (fmLoadingRef.current) return fmTracksRef.current
    fmLoadingRef.current = true
    setFmLoading(true)
    try {
      const base = append ? [...fmTracksRef.current] : []
      const target = base.length + 50
      let merged = base
      let freshTotal = 0
      let emptyStreak = 0
      // 接口一次只给 3 首，分批拉：每批 12 首，先渲染出来再继续补到 50
      for (let round = 0; round < 6 && merged.length < target; round++) {
        const res: any = await window.eApi.fmBatch(12)
        if (res && !Array.isArray(res) && res.error) {
          if (!merged.length) setMessage('私人FM加载失败：' + res.error)
          break
        }
        const list = Array.isArray(res) ? res : []
        if (!list.length) break
        const mapped = list.map(mapFmTrack).filter((t: Track) => t.id)
        mapped.forEach((t: Track) => fmIdsRef.current.add(t.id))
        const seen = new Set(merged.map((t) => t.id))
        const fresh = mapped.filter((t) => !seen.has(t.id))
        if (!fresh.length) { emptyStreak++; if (emptyStreak >= 2) break; continue }
        emptyStreak = 0
        freshTotal += fresh.length
        merged = [...merged, ...fresh]
        if (merged.length > target) merged = merged.slice(0, target)
        setFmTracks(merged)
        fmTracksRef.current = merged
      }
      if (!merged.length) {
        setMessage('私人FM暂时没有推荐，稍后再试试')
        return fmTracksRef.current
      }
      if (freshTotal === 0) setMessage('暂时没有更多推荐，稍后再试')
      return merged
    } catch (e: any) {
      setMessage(e?.body?.message || e?.message || '私人FM加载失败')
      return fmTracksRef.current
    } finally {
      fmLoadingRef.current = false
      setFmLoading(false)
    }
  }, [setMessage])

  /** 进入私人FM：切视图；没有列表就先拉 50 首 */
  const openFm = useCallback(async () => {
    setView('fm')
    if (fmTracksRef.current.length) return
    const list = await loadFm(false)
    if (list.length) {
      setFmMode(true)
      await playTrackRef.current(list[0], list)
    }
  }, [loadFm])

  /** 播放列表里的某一首 */
  const playFmTrack = useCallback(async (track: Track) => {
    setFmMode(true)
    await playTrackRef.current(track, fmTracksRef.current)
  }, [])

  /** 下一首：列表到头就自动再拉一批 */
  const fmNext = useCallback(async () => {
    const list = fmTracksRef.current
    const cur = playerRef.current.current
    const idx = cur ? list.findIndex((t) => t.id === cur.id) : -1
    let next = list[idx + 1]
    let queue = list
    if (!next) {
      const before = list.length
      queue = await loadFm(true)
      next = queue[before] || queue[queue.length - 1]
    }
    if (!next) { setMessage('私人FM暂时没有更多歌曲'); setFmMode(false); return }
    setFmMode(true)
    await playTrackRef.current(next, queue)
  }, [loadFm, setMessage])

  const fmModeRef = useRef(false)
  fmModeRef.current = fmMode
  const fmNextRef = useRef<() => void>(() => {})
  fmNextRef.current = () => { fmNext() }

  // ===== 热门评论 =====
  const [comments, setComments] = useState<CommentItem[]>([])
  const loadComments = useCallback(async (id: number) => {
    try {
      const res = await window.eApi.call('comment_music', { id, limit: 15 })
      const list: CommentItem[] = (res?.hotComments || res?.comments || []).map((c: any) => ({
        id: c.commentId,
        user: c.user?.nickname || '匿名',
        avatar: c.user?.avatarUrl || '',
        content: c.content || '',
        time: c.time ? new Date(c.time).toLocaleDateString('zh-CN') : '',
        likes: c.likedCount || 0
      }))
      setComments(list)
    } catch { setComments([]) }
  }, [])

  // 发表评论（需登录）
  const postComment = useCallback(async (id: number, content: string) => {
    if (!profile) { setMessage('登录后才能发表评论'); openLogin(); return false }
    if (!content.trim()) return false
    try {
      const res = await window.eApi.call('comment', { id, content: content.trim() })
      if (res?.code === 200) {
        setMessage('评论已发布')
        await loadComments(id)
        return true
      }
      setMessage(res?.message || '评论发布失败')
      return false
    } catch (e: any) {
      setMessage(e?.body?.message || '评论发布失败')
      return false
    }
  }, [profile, openLogin, setMessage, loadComments])

  // ===== 本地音乐 =====
  const [localTracks, setLocalTracks] = useState<Track[]>([])
  const [localLoading, setLocalLoading] = useState(false)
  const scanLocal = useCallback(async () => {
    setLocalLoading(true)
    try {
      const files: { path: string; name: string; size: number }[] = await window.eApi.localScan()
      const list: Track[] = files.map(toLocalTrack)
      setLocalTracks(list)
      if (list.length) setMessage(`已扫描 ${list.length} 首本地音乐`)
      else setMessage('该目录下未找到音频文件')
    } catch (e: any) { setMessage('扫描失败：' + (e?.message || '')) }
    setLocalLoading(false)
  }, [setMessage])

  // ===== 听书电台 =====
  const mapProgram = (item: any): Track | null => {
    const pg = item.program || item
    const ms = pg.mainSong || {}
    if (!ms.id) return null
    return {
      id: ms.id,
      name: pg.name || ms.name || '未知节目',
      artists: [{ id: 0, name: pg.radio?.name || pg.dj?.nickname || '电台节目' }],
      album: { id: pg.radio?.id || 0, name: pg.radio?.name || '', picUrl: pg.coverUrl || ms.picUrl || '' },
      duration: pg.duration || ms.duration || 0,
      fee: ms.fee || 0, mv: 0, alias: pg.radio?.name ? [pg.radio.name] : [],
      dj: true
    }
  }
  const [radioPrograms, setRadioPrograms] = useState<Track[]>([])
  const [radioLoading, setRadioLoading] = useState(false)
  const [radios, setRadios] = useState<RadioInfo[]>([])
  const [radiosLoading, setRadiosLoading] = useState(false)
  const [activeRadio, setActiveRadio] = useState<RadioInfo | null>(null)

  // ===== 在线收音机（Radio Browser，全球网络电台）=====
  const setRadioQuery = useCallback((patch: Partial<{ mode: string; keyword: string; countryCode: string; tag: string }>) => {
    setRadioQueryState((prev) => ({ ...prev, ...patch }))
  }, [])

  const loadRadioStations = useCallback(async () => {
    setNetRadioLoading(true)
    try {
      const list = await window.eApi.radioStations(radioQuery)
      if (Array.isArray(list)) setRadioStations(list)
      else setRadioStations([])
    } catch { setRadioStations([]) }
    setNetRadioLoading(false)
  }, [radioQuery])

  // 首次进入在线收音机时拉取国家/标签分类
  const loadRadioFacets = useCallback(async () => {
    try {
      const [countries, tags] = await Promise.all([
        window.eApi.radioFacets('countries').catch(() => []),
        window.eApi.radioFacets('tags').catch(() => [])
      ])
      if (Array.isArray(countries)) setRadioCountries(countries.slice(0, 60))
      if (Array.isArray(tags)) setRadioTags(tags.slice(0, 60))
    } catch { /* 分类失败不影响电台列表 */ }
  }, [])

  // ===== 在线收音机播放：HLS / 本地代理 / 直连 三级策略 =====
  const hlsRef = useRef<any>(null)
  const radioGenRef = useRef(0)

  /** 销毁 hls.js 实例（切台 / 切歌 / 停止时都要调用） */
  const destroyRadioHls = useCallback(() => {
    if (hlsRef.current) {
      try { hlsRef.current.destroy() } catch { /* 忽略 */ }
      hlsRef.current = null
    }
  }, [])

  /** 等待 <audio> 真正可播（playing / canplay / loadeddata），或超时、报错 */
  const waitPlayable = useCallback((el: HTMLAudioElement, timeoutMs = 8000) => new Promise<void>((resolve, reject) => {
    let done = false
    const finish = (err?: Error) => {
      if (done) return
      done = true
      el.removeEventListener('error', onError)
      el.removeEventListener('playing', onOk)
      el.removeEventListener('canplay', onOk)
      el.removeEventListener('loadeddata', onOk)
      clearTimeout(timer)
      if (err) reject(err)
      else resolve()
    }
    const onError = () => finish(new Error('音源无法播放'))
    const onOk = () => finish()
    const timer = setTimeout(() => {
      // 已经拿到元数据说明流是通的，只是缓冲慢：别急着重开，继续等它出声
      if (el.readyState >= 1) finish()
      else finish(new Error('连接超时'))
    }, timeoutMs)
    el.addEventListener('error', onError)
    el.addEventListener('playing', onOk)
    el.addEventListener('canplay', onOk)
    el.addEventListener('loadeddata', onOk)
  }), [])

  /** 用 hls.js 播放 m3u8；优先走本地代理（播放列表 + 分片全部同源，绕开 CORS） */
  const playHls = useCallback(async (url: string, gen: number) => {
    if (!audio) throw new Error('音频未就绪')
    const mod: any = await import('hls.js')
    const Hls = mod?.default || mod
    if (!Hls?.isSupported?.()) throw new Error('当前内核不支持 HLS')
    const proxied = await window.eApi.radioHlsUrl(url).catch(() => '')
    const candidates = [proxied, url].filter(Boolean) as string[]
    let lastErr: any = null
    for (const src of candidates) {
      if (gen !== radioGenRef.current) throw new Error('已切换电台')
      try {
        destroyRadioHls()
        await new Promise<void>((resolve, reject) => {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 30 })
          hlsRef.current = hls
          let settled = false
          const ok = () => { if (!settled) { settled = true; resolve() } }
          const fail = (_ev: any, data: any) => {
            if (!data?.fatal || settled) return
            settled = true
            try { hls.destroy() } catch { /* 忽略 */ }
            if (hlsRef.current === hls) hlsRef.current = null
            reject(new Error(data?.details || 'HLS 加载失败'))
          }
          hls.on(Hls.Events.MANIFEST_PARSED, ok)
          hls.on(Hls.Events.ERROR, fail)
          hls.loadSource(src)
          hls.attachMedia(audio)
        })
        audio.crossOrigin = 'anonymous'
        audio.play().catch(() => {})
        return
      } catch (e) { lastErr = e }
    }
    throw lastErr || new Error('HLS 播放失败')
  }, [audio, destroyRadioHls])

  // 播放网络电台：HLS 优先，其次本地代理（同源，可视化/转写都可用），最后直连
  const playRadioStation = useCallback(async (s: RadioStation) => {
    const streamUrl = s.urlResolved || s.url
    if (!streamUrl) { setMessage('该电台暂无可用流地址'); return }
    try { window.eApi.radioClick(s.stationuuid).catch(() => {}) } catch { /* 上报失败静默 */ }
    const gen = ++radioGenRef.current
    destroyRadioHls()
    setCurrentStation(s)
    setTranscripts([])
    stopPcmCapture()
    setTranscriptActive(false)
    if (!audio) { setMessage('音频未就绪，请稍后重试'); return }
    audio.pause()
    // 电台无时长概念，进度条隐藏由 currentStation 决定
    setPlayer((p) => ({
      ...p,
      current: {
        id: Math.abs(hashCode(s.stationuuid)),
        name: s.name,
        artists: [{ id: 0, name: s.country || '在线收音机' }],
        album: { id: 0, name: s.tags.slice(0, 2).join(' / ') || '在线电台', picUrl: s.favicon || '' },
        duration: 0,
        fee: 0,
        mv: 0,
        alias: [],
        streamUrl
      } as Track,
      isPlaying: true
    }))
    setMessage(`正在连接「${s.name}」…`)

    // 1) 明确是 m3u8，直接走 HLS
    if (/\.m3u8(\?|$)/i.test(streamUrl)) {
      try {
        await playHls(streamUrl, gen)
        setMessage(`正在播放：${s.name}`)
        return
      } catch { /* 落到探测流程 */ }
    } else {
      // 2) 没有 Web Audio 音频图、也没开转写时，先直连（起播最快）
      if (!hasAudioGraph() && !transcriptActiveRef.current) {
        try {
          audio.removeAttribute('crossorigin')
          audio.src = streamUrl
          audio.play().catch(() => {})
          await waitPlayable(audio, 6000)
          setMessage(`正在播放：${s.name}`)
          return
        } catch { /* 直连失败，转代理 */ }
      }
      if (gen !== radioGenRef.current) return
      // 3) 本地代理：同源，可视化与转写都能用
      const proxied = await window.eApi.audioRegister(streamUrl, true).catch(() => '')
      if (gen !== radioGenRef.current) return
      if (proxied) {
        try {
          audio.crossOrigin = 'anonymous'
          audio.src = proxied
          audio.play().catch(() => {})
          await waitPlayable(audio, 8000)
          setMessage(`正在播放：${s.name}`)
          return
        } catch { /* 继续兜底 */ }
      }
    }
    if (gen !== radioGenRef.current) return

    // 3) 探测真实类型：可能是 HLS、也可能是被 .pls/.m3u 包了一层
    const probe = await window.eApi.radioProbe(streamUrl).catch(() => null)
    if (gen !== radioGenRef.current) return
    if (probe?.kind === 'hls') {
      try {
        await playHls(probe.url || streamUrl, gen)
        setMessage(`正在播放：${s.name}`)
        return
      } catch { /* 继续兜底 */ }
    }
    if (probe?.kind === 'audio' && probe.url && probe.url !== streamUrl) {
      // 播放列表解析出的真实地址
      const proxied = await window.eApi.audioRegister(probe.url, true).catch(() => '')
      if (proxied && gen === radioGenRef.current) {
        try {
          audio.crossOrigin = 'anonymous'
          audio.src = proxied
          audio.play().catch(() => {})
          await waitPlayable(audio, 8000)
          setMessage(`正在播放：${s.name}`)
          return
        } catch { /* 继续兜底 */ }
      }
    }

    // 4) 最后直连原始地址（可能因跨域导致可视化/转写不可用，但至少能听）
    try {
      audio.removeAttribute('crossorigin')
      audio.src = streamUrl
      audio.play().catch(() => {})
      await waitPlayable(audio, 7000)
      setMessage(`正在播放：${s.name}`)
      return
    } catch { /* 确实放不了 */ }

    setPlayer((p) => ({ ...p, isPlaying: false }))
    setMessage(`「${s.name}」暂时无法播放${probe?.error ? `（${probe.error}）` : ''}，换一个台试试`)
  }, [setMessage, playHls, destroyRadioHls, waitPlayable])

  const stopRadio = useCallback(() => {
    radioGenRef.current++
    destroyRadioHls()
    setCurrentStation(null)
    setTranscriptActive(false)
    setTranscripts([])
    stopPcmCapture()
    audio?.pause()
  }, [destroyRadioHls])

  // 实时转文字：每 4 秒抓一段 PCM 交给本地 ASR，结果像歌词一样追加
  const toggleTranscript = useCallback(async (on: boolean) => {
    if (!on) { stopPcmCapture(); setTranscriptActive(false); return }
    const st = await window.eApi.asrStatus().catch(() => ({ ready: false, size: 0 }))
    if (!st?.ready) { setMessage('请先在「设置 → 语音转文字」里下载模型（约 230MB）'); return }
    const ok = ensureGraph(audio)
    if (!ok) { setMessage('音频初始化失败，无法开启转写'); return }
    // HLS 走的是 MSE(blob)，本身同源，不需要换源；
    // 只有直连的跨域电台才需要切到本地代理重播，否则 Web Audio 会因 CORS 输出静音
    const usingHls = !!hlsRef.current
    if (currentStation && !usingHls && audio && audio.crossOrigin !== 'anonymous') {
      const url = currentStation.urlResolved || currentStation.url
      const proxied = await window.eApi.audioRegister(url, true).catch(() => '')
      if (proxied) {
        try {
          audio.crossOrigin = 'anonymous'
          audio.src = proxied
          await waitPlayable(audio, 8000)
          audio.play().catch(() => {})
        } catch { /* 代理失败时保持原播放 */ }
      }
    }
    setTranscriptActive(true)
    let errorShown = false
    startPcmCapture(4, async (pcm) => {
      try {
        const text = await window.eApi.asrRecognize(Array.from(pcm))
        if (typeof text === 'string') {
          if (text.trim()) {
            setTranscripts((prev) => [
              ...prev.slice(-40),
              { id: Date.now(), text: text.trim(), time: Date.now() }
            ])
          }
          return
        }
        // 主进程返回 { error }：只提示一次，避免刷屏
        const msg = (text as any)?.error
        if (msg && !errorShown) {
          errorShown = true
          setMessage(`语音识别失败：${msg}`)
        }
      } catch { /* 单段识别失败不中断 */ }
    })
    setMessage('实时转文字已开启')
  }, [setMessage, currentStation, waitPlayable])

  // 电台列表：优先走聚合接口（分页遍历+缓存，一次拿到全部分类电台）；失败降级单接口
  const loadRadios = useCallback(async () => {
    setRadiosLoading(true)
    const mapRadio = (r: any, cat: string): RadioInfo => ({
      id: r.id, name: r.name, picUrl: r.picUrl || '',
      programCount: r.programCount || 0, category: r.category || cat
    })
    try {
      const agg = await window.eApi.djFetchAll()
      if (agg?.byCategory && Object.keys(agg.byCategory).length) {
        const cats = Object.keys(agg.byCategory)
        setAggCats(cats)
        // 全量电台打平保存（新内容在前；旧电台保留在原位置）
        setRadios(cats.flatMap((cat) => (agg.byCategory[cat] || []).map((r: any) => mapRadio(r, cat))))
        setRadiosLoading(false)
        // 增量提示：本次新发现多少个电台
        const fresh = agg.freshCount || 0
        if (fresh > 0) setMessage(`已更新 ${fresh} 个新电台（共 ${agg.totalRadios} 个）`)
        return
      }
    } catch { }
    // 降级：单接口双兜底
    let list: RadioInfo[] = []
    try {
      const res = await window.eApi.call('dj_hot', { limit: 30 })
      list = (res?.djRadios || []).map((r: any) => mapRadio(r, '热门'))
    } catch { }
    if (!list.length) {
      try {
        const res = await window.eApi.call('dj_recommend', {})
        list = (res?.djRadios || res?.data || []).map((r: any) => mapRadio(r, '推荐'))
      } catch { }
    }
    setRadios(list)
    if (!list.length) setMessage('电台列表加载失败（接口限频），请稍后点击刷新重试')
    setRadiosLoading(false)
    loadRadioCats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 某电台的节目列表（dj_program 用 rid 参数；限频自动重试）
  const loadRadioPrograms = useCallback(async (radioId: number) => {
    setRadioLoading(true)
    setRadioPrograms([])
    const fetchOnce = async () => {
      const res = await window.eApi.call('dj_program', { rid: radioId, limit: 30, asc: false })
      const data = res?.data || res?.programs || {}
      const list = (data.programs || (Array.isArray(data) ? data : [])).map(mapProgram).filter(Boolean) as Track[]
      return list
    }
    try {
      let list: Track[] = []
      try { list = await fetchOnce() } catch { }
      if (!list.length) {
        await new Promise((r) => setTimeout(r, 2500))
        try { list = await fetchOnce() } catch { }
      }
      setRadioPrograms(list)
      if (!list.length) setMessage('该电台节目暂时拉取不到（接口限频），稍后重试')
    } catch { setMessage('节目加载失败') }
    setRadioLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMessage])

  // 听书分区：聚合接口返回的分类（17 类，含相声曲艺/故事等分页拉出的分类）
  const [aggCats, setAggCats] = useState<string[]>([])
  // 听书分区：一次拉全部分类组，前端按分类展示
  const [radioCats, setRadioCats] = useState<RadioCategory[]>([])
  const [activeCat, setActiveCat] = useState<number>(-1) // -1=全部（dj_recommend 推荐）
  const loadRadioCats = useCallback(async (retry = true) => {
    try {
      const res = await window.eApi.call('dj_category_recommend', { type: 10001 })
      const cats: RadioCategory[] = (res?.data || []).map((g: any) => ({
        categoryId: g.categoryId,
        categoryName: g.categoryName,
        radios: (g.radios || []).map((r: any) => ({
          id: r.id, name: r.name, picUrl: r.picUrl || '',
          programCount: r.programCount || 0, category: g.categoryName || ''
        }))
      }))
      // 接口偶发限频返回空：延迟 3s 自动重试一次
      if (!cats.length && retry) {
        setTimeout(() => loadRadioCats(false), 3000)
        return
      }
      setRadioCats(cats)
      // 有声书分区多源聚合：尽量多拿有声书电台（category_recommend / recommend / hot 三路合并去重）
      setTimeout(async () => {
        try {
          const seen = new Set<string>()
          const agg: RadioInfo[] = []
          const push = (list: any[], cat: string) => {
            for (const r of list) {
              if (!r?.id || seen.has(String(r.id))) continue
              if (r.category && cat !== '有声书' && r.category !== cat) continue
              seen.add(String(r.id))
              agg.push({ id: r.id, name: r.name, picUrl: r.picUrl || '', programCount: r.programCount || 0, category: r.category || cat })
            }
          }
          // 已有分类组数据
          push((cats.find((c) => c.categoryId === 10001)?.radios || []).map((r) => ({ ...r, category: '有声书' })), '有声书')
          try { const rec = await window.eApi.call('dj_recommend', {}); push((rec?.djRadios || rec?.data || []).filter((x: any) => x.category === '有声书'), '有声书') } catch { }
          try { const hot = await window.eApi.call('dj_hot', { limit: 50 }); push((hot?.djRadios || []).filter((x: any) => x.category === '有声书'), '有声书') } catch { }
          // 补充进分类组
          setRadioCats((prev) => {
            const next = prev.map((c) => c.categoryId === 10001 ? { ...c, radios: agg.length ? agg : c.radios } : c)
            return next
          })
        } catch { }
      }, 800)
    } catch {
      if (retry) setTimeout(() => loadRadioCats(false), 3000)
      else setRadioCats([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 已登录 -> 加载歌单
  useEffect(() => {
    if (profile) loadPlaylists()
    else {
      setPlaylists([])
      setTracks([])
    }
  }, [profile?.userId])

  const loadPlaylists = useCallback(async () => {
    try {
      const res = await window.eApi.call('user_playlist', { uid: profile?.userId, limit: 100 })
      const list: Playlist[] = (res?.playlist || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        coverImgUrl: p.coverImgUrl,
        trackCount: p.trackCount,
        playCount: p.playCount,
        description: p.description,
        creator: p.creator ? { nickname: p.creator.nickname } : undefined,
        specialType: p.specialType
      }))
      setPlaylists(list)
    } catch (e: any) {
      console.error('加载歌单失败', e)
      setMessage('歌单加载失败，请检查登录状态或网络')
    }
  }, [profile?.userId, setMessage])

  const switchAccount = useCallback(async (id: string) => {
    try {
      const res: any = await window.eApi.accountsSwitch(id)
      if (res?.ok && res.profile) {
        setProfileState(res.profile)
        await refreshAccounts()
        await loadPlaylists()
        setMessage(`已切换到「${res.profile.nickname}」`)
        return true
      }
      setMessage('该账号登录状态已失效，请重新扫码登录')
      return false
    } catch (e: any) {
      setMessage('切换账号失败：' + (e?.message || '未知错误'))
      return false
    }
  }, [refreshAccounts, loadPlaylists, setMessage])

  const removeAccount = useCallback(async (id: string) => {
    try {
      await window.eApi.accountsRemove(id)
      await refreshAccounts()
      setMessage('已移除该账号')
    } catch {
      setMessage('移除账号失败')
    }
  }, [refreshAccounts, setMessage])

  const loadLyric = useCallback(async (id: number) => {
    // 切歌很快时，旧请求可能后返回并覆盖新歌歌词 → 用序号丢弃过期响应
    const seq = ++lyricSeqRef.current
    try {
      const res = await window.eApi.call('lyric', { id })
      if (seq !== lyricSeqRef.current) return
      const lrc = res?.lrc?.lyric || ''
      const trans = res?.tlyric?.lyric || ''
      const klyric = res?.klyric?.lyric || ''
      setLyricLines(parseLyric(lrc, trans, klyric))
    } catch {
      if (seq === lyricSeqRef.current) setLyricLines([])
    }
  }, [])

  // quality 使用 ref，避免切换音质回调闭包过期
  const qualityRef = useRef(quality)
  qualityRef.current = quality

  /** 获取播放地址并播放 */
  const resolveAndPlay = useCallback(
    async (track: Track, autoPlay: boolean, keepProgress = false) => {
      // 切到普通歌曲：取消未完成的电台连接并销毁 HLS 实例
      radioGenRef.current++
      destroyRadioHls()
      setCurrentStation(null)
      setSongUrlLoading(true)
      const savedTime = keepProgress && audio ? audio.currentTime : 0
      // 本地音乐：直接 file:// 播放，不经过音源接口
      if (track.localPath) {
        if (!audio) return
        const localStream = await window.eApi.audioRegisterLocal(track.localPath).catch(() => '')
        if (localStream) {
          audio.crossOrigin = 'anonymous'
          audio.src = localStream
        } else {
          audio.removeAttribute('crossorigin')
          audio.src = 'file:///' + track.localPath.replace(/\\/g, '/')
        }
        syncAudioGraph(customizationRef.current)
        // 自动识别同名封面与歌词文件
        const meta = await window.eApi.localMeta(track.localPath).catch(() => null)
        const patched = meta?.cover ? { ...track, album: { ...track.album, picUrl: meta.cover } } : track
        audio.play().catch(() => {})
        setPlayer((p) => ({
          ...p,
          current: patched,
          playlist: p.playlist.map((x) => (x.localPath === track.localPath ? patched : x)),
          isPlaying: autoPlay
        }))
        setCurrentQuality('本地')
        setCurrentQualityInfo(null)
        setSongUrlLoading(false)
        lyricSeqRef.current++ // 本地歌词优先，丢弃可能在途的在线歌词
        setLyricLines(meta?.lyric ? parseLyric(meta.lyric, '', '') : [])
        return
      }
      try {
        const result: SongUrlResult | null = await window.eApi.songUrl(track.id, qualityRef.current)
        if (!result || !result.url) {
          setMessage(result?.reason || '这首歌暂无可播放音源（可能受版权或地区限制）')
          setPlayer((p) => ({ ...p, isPlaying: false }))
          audio?.pause()
          return
        }
        if (result.freeTrialInfo) {
          setMessage('当前账号非会员，仅能试听片段 · 扫码登录会员账号可完整播放')
        } else if (track.fee === 1 && !result.payed) {
          setMessage('会员歌曲：登录会员账号后可完整播放')
        }
        setCurrentQuality((result.level || qualityRef.current).toUpperCase())
        setCurrentQualityInfo({ ...result, level: result.level || qualityRef.current })
        if (!audio) return
        // 通过主进程本地代理播放：同源流才能被 Web Audio 分析且不会静音
        const stream = await window.eApi.audioRegister(result.url).catch(() => '')
        if (stream) {
          audio.crossOrigin = 'anonymous'
          audio.src = stream
        } else {
          audio.removeAttribute('crossorigin')
          audio.src = result.url
        }
        syncAudioGraph(customizationRef.current)
        audio.volume = playerRef.current.volume
        if (keepProgress && savedTime > 0) {
          const applySeek = () => { try { audio.currentTime = Math.min(savedTime, audio.duration || savedTime) } catch {} }
          if (audio.readyState >= 1) applySeek()
          else audio.addEventListener('loadedmetadata', applySeek, { once: true })
        }
        if (autoPlay) {
          await audio.play().catch(() => {
            setMessage('播放被浏览器拦截，请再次点击播放')
          })
        }
        setPlayer((p) => ({ ...p, isPlaying: autoPlay }))
      } catch (e: any) {
        console.error('获取播放地址失败', e)
        setMessage('获取播放地址失败，请稍后重试')
      } finally {
        setSongUrlLoading(false)
      }
    },
    [setMessage, destroyRadioHls]
  )

  const playTrack = useCallback(
    async (track: Track, list?: Track[]) => {
      setPlayer((p) => ({
        ...p,
        current: track,
        playlist: list && list.length ? list : p.playlist.length ? p.playlist : [track]
      }))
      setLyricLines([])
      if (!track.localPath) await loadLyric(track.id)
      await resolveAndPlay(track, true)
    },
    [loadLyric, resolveAndPlay]
  )
  // 供私人FM 等前置定义的逻辑复用
  playTrackRef.current = playTrack

  const openLocalFiles = useCallback(async () => {
    try {
      const files: { path: string; name: string; size: number }[] = await window.eApi.localOpen()
      if (!files?.length) return
      const list = files.map(toLocalTrack)
      setLocalTracks((prev) => {
        const map = new Map(prev.map((t) => [String(t.localPath), t]))
        for (const t of list) map.set(String(t.localPath), t)
        return Array.from(map.values())
      })
      setView('local')
      await playTrack(list[0], list)
      setMessage(`正在播放本地文件：${list[0].name}`)
    } catch (e: any) {
      setMessage('打开本地文件失败：' + (e?.message || '未知错误'))
    }
  }, [playTrack, setMessage])

  const togglePlay = useCallback(() => {
    if (!audio) return
    if (!playerRef.current.current) return
    if (playerRef.current.isPlaying) {
      audio.pause()
      setPlayer((p) => ({ ...p, isPlaying: false }))
    } else {
      if (!audio.src) {
        resolveAndPlay(playerRef.current.current, true)
        return
      }
      audio.play().catch(() => setMessage('播放失败，请重试'))
      setPlayer((p) => ({ ...p, isPlaying: true }))
    }
  }, [resolveAndPlay, setMessage])

  const playIndex = useCallback(
    (index: number) => {
      const list = playerRef.current.playlist
      if (index < 0 || index >= list.length) return
      playTrack(list[index], list)
    },
    [playTrack]
  )

  const nextTrack = useCallback(() => {
    const p = playerRef.current
    if (!p.playlist.length) return
    const idx = p.playlist.findIndex((t) => t.id === p.current?.id)
    if (playModeRef.current === 'shuffle') {
      let n = idx
      while (n === idx && p.playlist.length > 1) n = Math.floor(Math.random() * p.playlist.length)
      playIndex(n)
    } else {
      playIndex((idx + 1) % p.playlist.length)
    }
  }, [playIndex])

  const prevTrack = useCallback(() => {
    const p = playerRef.current
    if (!p.playlist.length) return
    const idx = p.playlist.findIndex((t) => t.id === p.current?.id)
    playIndex((idx - 1 + p.playlist.length) % p.playlist.length)
  }, [playIndex])

  const seek = useCallback((time: number) => {
    if (!audio) return
    audio.currentTime = time
    setPlayer((p) => ({ ...p, currentTime: time }))
  }, [])

  const setVolume = useCallback((v: number) => {
    if (audio) audio.volume = v
    setPlayer((p) => ({ ...p, volume: v }))
    window.eApi.store.setVolume(v).catch(() => {})
  }, [])

  const setPlayMode = useCallback((m: PlayerState['playMode']) => {
    setPlayer((p) => ({ ...p, playMode: m }))
  }, [])

  // 主题切换
  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t)
    window.eApi.store.setTheme(t).catch(() => {})
  }, [])

  // 音质切换：仅登录后可用，切换后用新音质重新解析当前歌曲（保持进度）
  const setQuality = useCallback((level: string) => {
    setQualityState(level)
    qualityRef.current = level
    window.eApi.store.setQuality(level).catch(() => {})
    // 立即把右下角音质标签更新到所选档位，避免异步解析期间（或解析失败时）
    // 标签停留在旧音质。接口若实际降级，resolveAndPlay 成功后会再修正为真实档位。
    setCurrentQuality((prev) => (prev === '本地' ? prev : level.toUpperCase()))
    setCurrentQualityInfo((prev) => (prev ? { ...prev, level } : prev))
    const cur = playerRef.current.current
    if (cur && audio) {
      resolveAndPlay(cur, playerRef.current.isPlaying, true)
    }
  }, [resolveAndPlay])

  // 重新解析当前歌曲（登录态变化后调用，恢复到会员音质）
  const reresolveCurrent = useCallback(async () => {
    const cur = playerRef.current.current
    if (cur && audio) await resolveAndPlay(cur, playerRef.current.isPlaying, true)
  }, [resolveAndPlay])

  // 登录后重新拉取音质（会员身份生效）
  useEffect(() => {
    if (profile && playerRef.current.current) {
      const t = setTimeout(() => reresolveCurrent(), 300)
      return () => clearTimeout(t)
    }
  }, [profile?.userId])

  // 桌面歌词按钮统一入口：
  // - 未开启 → 开启
  // - 开启且锁定 → 先解锁（锁定时窗口鼠标穿透，这是界面内的唯一解锁途径）
  // - 开启且未锁定 → 关闭
  const toggleDesktopLyrics = useCallback(async () => {
    try {
      const s: any = await window.eApi.lyrics.getSettings()
      const isOpen = !!(s?.enabled || desktopLyrics.enabled)
      if (!isOpen) {
        await window.eApi.lyrics.open()
        setDesktopLyricsState((p) => ({ ...p, enabled: true }))
        setMessage('桌面歌词已开启，按住窗口即可拖动')
        return
      }
      if (s?.locked) {
        await window.eApi.lyrics.lock(false)
        setDesktopLyricsState((p) => ({ ...p, enabled: true, locked: false }))
        setMessage('桌面歌词已解锁，现在可以拖动了')
        return
      }
      await window.eApi.lyrics.close()
      setDesktopLyricsState((p) => ({ ...p, enabled: false }))
      setMessage('桌面歌词已关闭')
    } catch {
      setMessage('桌面歌词操作失败')
    }
  }, [desktopLyrics.enabled, setMessage])

  // 全局快捷键动作（主进程 globalShortcut 转发）
  useEffect(() => {
    const off = window.eApi.onGlobalAction?.((action: string) => {
      if (action === 'toggle-play') togglePlay()
      else if (action === 'next') nextTrack()
      else if (action === 'prev') prevTrack()
      else if (action === 'vol-up') setVolume(Math.min(1, playerRef.current.volume + 0.05))
      else if (action === 'vol-down') setVolume(Math.max(0, playerRef.current.volume - 0.05))
    })
    return () => off?.()
  }, [togglePlay, nextTrack, prevTrack, setVolume])

  // 歌词窗内 ✕ 关闭 / 托盘操作时，同步主界面按钮状态
  useEffect(() => {
    const off = (window.eApi.lyrics as any).onEnabledSync?.((enabled: boolean) => {
      setDesktopLyricsState((s) => ({ ...s, enabled }))
    })
    // 托盘/快捷键解锁时同步 locked 状态
    const offS = window.eApi.lyrics.onSettings((s: any) => {
      if (s) setDesktopLyricsState((p) => ({ ...p, ...s, enabled: !!s.enabled || p.enabled }))
    })
    return () => { off?.(); offS() }
  }, [])

  const updateDesktopLyrics = useCallback(async (patch: Partial<DesktopLyricsSettings>) => {
    try {
      const next = await window.eApi.lyrics.settings(patch)
      setDesktopLyricsState(next)
    } catch {
      /* 忽略 */
    }
  }, [])

  // 历史播放：把本地记录的歌曲 id 批量还原为歌曲信息（最近 100 条）
  const loadHistory = useCallback(async () => {
    try {
      const s = await window.eApi.store.get()
      const ids: number[] = (s?.playHistory || []).slice(0, 100)
      if (!ids.length) { setHistoryTracks([]); return }
      const res = await window.eApi.call('song_detail', { ids: ids.join(',') })
      const list: Track[] = (res?.songs || [])
        .filter((t: any) => t && t.id && t.name)
        .map((t: any) => ({
        id: t.id,
        name: t.name,
        artists: (t.ar || t.artists || []).map((a: any) => ({ id: a.id, name: a.name })),
        album: { id: t.al?.id || 0, name: t.al?.name || '', picUrl: t.al?.picUrl || '' },
        duration: t.dt || t.duration || 0,
        fee: t.fee,
        mv: t.mv,
        alias: t.alias
      }))
      // 按播放时间倒序（playHistory 本身就是最新在前）
      const order = new Map(ids.map((id, i) => [id, i]))
      list.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
      setHistoryTracks(list)
    } catch (e) {
      console.error('加载历史失败', e)
      setMessage('播放历史加载失败')
    }
  }, [setMessage])

  // 搜索
  const doSearch = useCallback(async (keyword: string) => {
    const kw = keyword.trim()
    if (!kw) return
    setSearchKeyword(kw)
    setView('search')
    setSearching(true)
    setSearchError('')
    // 搜索历史：去重置顶，最多保留 12 条
    const history = [kw, ...(customizationRef.current.searchHistory || []).filter((x) => x !== kw)].slice(0, 12)
    setCustomization({ searchHistory: history })
    try {
      // 多级兜底搜索：云搜索 → 旧搜索 → 建议词，结果统一成旧接口结构
      const res: any = await window.eApi.smartSearch(kw)
      const apiError = res?.error || ''
      const songRes = { result: { songs: res?.songs || [] } }
      const plRes = { result: { playlists: res?.playlists || [] } }
      const djRes = { result: { shows: res?.shows || [] } }
      const alRes = { result: { albums: res?.albums || [] } }
      const arRes = { result: { artists: res?.artists || [] } }
      const lyricRes = { result: { songs: res?.lyricSongs || [] } }
      const songs: Track[] = (songRes?.result?.songs || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        artists: (s.artists || s.ar || []).map((a: any) => ({ id: a.id, name: a.name })),
        album: {
          id: s.album?.id || s.al?.id || 0,
          name: s.album?.name || s.al?.name || '',
          picUrl: s.album?.picUrl || s.al?.picUrl || ''
        },
        duration: s.duration || s.dt || 0,
        fee: s.fee,
        mv: s.mv,
        alias: s.alias
      }))
      const playlists: Playlist[] = (plRes?.result?.playlists || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        coverImgUrl: p.coverImgUrl,
        trackCount: p.trackCount,
        playCount: p.playCount,
        creator: p.creator ? { nickname: p.creator.nickname } : undefined
      }))
      // 听书节目（声音）
      const shows: Track[] = []
      for (const show of djRes?.result?.shows || djRes?.result?.programList || []) {
        const ms = show.mainSong || {}
        if (!ms.id) continue
        shows.push({
          id: ms.id, name: show.name || ms.name || '',
          artists: [{ id: 0, name: show.dj?.nickname || show.radio?.name || '电台节目' }],
          album: { id: show.radio?.id || 0, name: show.radio?.name || '', picUrl: show.coverUrl || ms.picUrl || '' },
          duration: show.duration || ms.duration || 0, fee: ms.fee || 0, mv: 0,
          alias: show.radio?.name ? [show.radio.name] : [], dj: true
        })
      }
      // 专辑 / 歌手
      const albums = (alRes?.result?.albums || []).map((x: any) => ({ id: x.id, name: x.name, coverImgUrl: x.picUrl, artist: x.artist?.name || '', size: x.size || 0 }))
      const artists = (arRes?.result?.artists || []).map((x: any) => ({ id: x.id, name: x.name, picUrl: x.picUrl || x.img1v1Url || '', albumSize: x.albumSize || 0 }))
      // 歌词搜索：接口返回歌曲列表并附带歌词正文，截取命中关键词附近的片段
      const lyricHits: LyricSearchItem[] = (lyricRes?.result?.songs || []).map((s: any) => {
        const rawLyric = s.lyrics?.txt || s.lyrics?.lyric || s.lyric || s.lyrics || ''
        const lines: string[] = String(typeof rawLyric === 'string' ? rawLyric : rawLyric?.txt || '')
          .split('\n')
          .map((l: string) => l.replace(/^\[[^\]]*\]/, '').trim())
          .filter((l: string) => l && !/^by:/i.test(l))
        const hit = lines.findIndex((l) => l.includes(kw))
        const picked = lines.slice(hit >= 0 ? hit : 0, (hit >= 0 ? hit : 0) + 2).join(' / ')
        return {
          id: s.id,
          name: s.name || '',
          artists: (s.artists || s.ar || []).map((a: any) => a.name).join(' / '),
          snippet: picked.length > 90 ? picked.slice(0, 90) + '…' : picked
        }
      })
      setSearchResults({ songs, playlists, shows, albums, artists, lyricHits })
      if (!songs.length && !playlists.length && !shows.length && !albums.length && !artists.length && !lyricHits.length) {
        setSearchError(friendlyNetError(apiError) || '没有找到相关内容，换个关键词试试')
      }
      // search 接口不再返回封面 picUrl：批量 song_detail 补全
      const ids = songs.map((s) => s.id).join(',')
      if (ids) {
        try {
          const det = await window.eApi.call('song_detail', { ids })
          const picMap = new Map<string, string>()
          ;(det?.songs || []).forEach((d: any) => {
            if (d?.al?.picUrl) picMap.set(String(d.id), d.al.picUrl)
          })
          if (picMap.size) {
            const filled = songs.map((s) => ({ ...s, album: { ...s.album, picUrl: s.album.picUrl || picMap.get(String(s.id)) || '' } }))
            setSearchResults((prev) => (prev ? { ...prev, songs: filled } : prev))
          }
        } catch { /* 封面补全失败不影响列表 */ }
      }
    } catch (e: any) {
      console.error('搜索失败', e)
      setSearchError('搜索失败：' + friendlyNetError(e?.body?.message || e?.message || '网络错误'))
      setSearchResults({ songs: [], playlists: [], shows: [], albums: [], artists: [], lyricHits: [] })
    } finally {
      setSearching(false)
    }
  }, [setCustomization])

  /** 搜索补充分区：专辑 / 听书 / 歌词，点开对应标签时才请求 */
  const loadSearchSection = useCallback(async (kind: 'albums' | 'shows' | 'lyrics') => {
    const kw = searchKeywordRef.current
    if (!kw) return
    if (searchExtraRef.current.kw !== kw) searchExtraRef.current = { kw, loaded: new Set() }
    if (searchExtraRef.current.loaded.has(kind)) return
    searchExtraRef.current.loaded.add(kind)
    try {
      const res: any = await window.eApi.searchSection(kw, kind)
      if (res && !Array.isArray(res) && res.error) {
        searchExtraRef.current.loaded.delete(kind)
        setMessage(friendlyNetError(res.error))
        return
      }
      const list: any[] = Array.isArray(res) ? res : []
      if (kind === 'albums') {
        const albums = list.map((x: any) => ({ id: x.id, name: x.name, coverImgUrl: x.picUrl, artist: x.artist?.name || '', size: x.size || 0 }))
        setSearchResults((prev) => (prev ? { ...prev, albums } : prev))
      } else if (kind === 'shows') {
        const shows: Track[] = []
        for (const show of list) {
          const ms = show.mainSong || {}
          if (!ms.id) continue
          shows.push({
            id: ms.id, name: show.name || ms.name || '',
            artists: [{ id: 0, name: show.dj?.nickname || show.radio?.name || '电台节目' }],
            album: { id: show.radio?.id || 0, name: show.radio?.name || '', picUrl: show.coverUrl || ms.picUrl || '' },
            duration: show.duration || ms.duration || 0, fee: ms.fee || 0, mv: 0,
            alias: show.radio?.name ? [show.radio.name] : [], dj: true
          })
        }
        setSearchResults((prev) => (prev ? { ...prev, shows } : prev))
      } else {
        const lyricHits: LyricSearchItem[] = list.map((s: any) => {
          const rawLyric = s.lyrics?.txt || s.lyrics?.lyric || s.lyric || s.lyrics || ''
          const lines: string[] = String(typeof rawLyric === 'string' ? rawLyric : rawLyric?.txt || '')
            .split('\n')
            .map((l: string) => l.replace(/^\[[^\]]*\]/, '').trim())
            .filter((l: string) => l && !/^by:/i.test(l))
          const hit = lines.findIndex((l) => l.includes(kw))
          const picked = lines.slice(hit >= 0 ? hit : 0, (hit >= 0 ? hit : 0) + 2).join(' / ')
          return {
            id: s.id,
            name: s.name || '',
            artists: (s.artists || s.ar || []).map((a: any) => a.name).join(' / '),
            snippet: picked.length > 90 ? picked.slice(0, 90) + '…' : picked
          }
        })
        setSearchResults((prev) => (prev ? { ...prev, lyricHits } : prev))
      }
    } catch (e: any) {
      searchExtraRef.current.loaded.delete(kind)
      setMessage(friendlyNetError(e?.message || '') || '加载失败')
    } finally {
    }
  }, [setMessage])

  // 搜索历史（持久化在个性化配置）
  const searchHistory = customization.searchHistory || []
  const clearSearchHistory = useCallback(() => setCustomization({ searchHistory: [] }), [setCustomization])
  const removeSearchHistory = useCallback((kw: string) => {
    setCustomization({ searchHistory: (customizationRef.current.searchHistory || []).filter((x) => x !== kw) })
  }, [setCustomization])

  // 打开歌手页（热门 50 首直接作为播放列表）
  const openArtist = useCallback(async (id: number, name: string) => {
    try {
      const res = await window.eApi.call('artist_top_song', { id })
      const list: Track[] = (res?.songs || []).map((t: any) => ({
        id: t.id, name: t.name,
        artists: (t.ar || t.artists || []).map((a: any) => ({ id: a.id, name: a.name })),
        album: { id: (t.al || t.album)?.id || 0, name: (t.al || t.album)?.name || '', picUrl: (t.al || t.album)?.picUrl || '' },
        duration: t.dt || t.duration || 0, fee: t.fee, mv: t.mv, alias: t.alia || t.alias
      }))
      setTracks(list)
      setPlaylistName(`${name} 的热门歌曲`)
      setCurrentPlaylistId(-id)
      setView('playlist')
    } catch (e: any) { setMessage(e?.body?.message || '加载歌手失败') }
  }, [setMessage])

  // 打开专辑页
  const openAlbum = useCallback(async (id: number, name: string) => {
    try {
      const res = await window.eApi.call('album', { id })
      const alb = res?.album || {}
      const list: Track[] = (res?.songs || []).map((t: any) => ({
        id: t.id, name: t.name,
        artists: (t.ar || t.artists || []).map((a: any) => ({ id: a.id, name: a.name })),
        album: { id: alb.id || 0, name: alb.name || name, picUrl: alb.picUrl || '' },
        duration: t.dt || t.duration || 0, fee: t.fee, mv: t.mv, alias: t.alia || t.alias
      }))
      setTracks(list)
      setPlaylistName(`${alb.name || name} · ${(alb.artist || {}).name || ''}`)
      setCurrentPlaylistId(-id - 1000000)
      setView('playlist')
    } catch (e: any) { setMessage(e?.body?.message || '加载专辑失败') }
  }, [setMessage])

  const openPlaylist = useCallback(async (id: number) => {
    setPlaylistLoading(true)
    setCurrentPlaylistId(id)
    setView('playlist')
    try {
      const res = await window.eApi.call('playlist_detail', { id })
      const pl = res?.playlist || {}
      const list: Track[] = (res?.songs || pl?.tracks || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        artists: (s.artists || s.ar || []).map((a: any) => ({ id: a.id, name: a.name })),
        album: {
          id: s.album?.id || s.al?.id || 0,
          name: s.album?.name || s.al?.name || '',
          picUrl: s.album?.picUrl || s.al?.picUrl || ''
        },
        duration: s.duration || s.dt || 0,
        fee: s.fee,
        mv: s.mv,
        alias: s.alias
      }))
      setTracks(list)
      setPlaylistName(pl.name || '歌单')
    } catch (e: any) {
      console.error('加载歌单详情失败', e)
      setMessage('歌单详情加载失败')
    } finally {
      setPlaylistLoading(false)
    }
  }, [setMessage])

  // ===== 歌单批量操作 =====
  const batchAddToPlaylist = useCallback(async (playlistId: number, list: Track[]) => {
    if (!list.length) return
    try {
      const res = await window.eApi.call('playlist_tracks', { pid: playlistId, tracks: list.map((t) => t.id).join(','), op: 'add' })
      if (res?.body?.code === 200 || res?.code === 200) setMessage(`已添加 ${list.length} 首歌曲到歌单`)
      else setMessage(res?.body?.message || res?.message || '批量添加失败')
    } catch (e: any) {
      setMessage(e?.body?.message || e?.message || '批量添加失败（需要登录）')
    }
  }, [setMessage])

  const batchRemoveFromPlaylist = useCallback(async (playlistId: number, ids: number[]) => {
    if (!ids.length) return
    try {
      const res = await window.eApi.call('playlist_tracks', { pid: playlistId, tracks: ids.join(','), op: 'del' })
      if (res?.body?.code === 200 || res?.code === 200) {
        setMessage(`已从歌单移除 ${ids.length} 首歌曲`)
        if (currentPlaylistId === playlistId) await openPlaylist(playlistId)
        await loadPlaylists()
      } else {
        setMessage(res?.body?.message || res?.message || '移除失败')
      }
    } catch (e: any) {
      setMessage(e?.body?.message || e?.message || '移除失败（需要登录）')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlaylistId, setMessage])

  /** 批量下载：串行执行，避免并发请求被网易云风控；使用设置里的默认音质 */
  const batchDownload = useCallback(async (list: Track[]) => {
    if (!list.length) return
    const pref = customizationRef.current.downloadQuality || 'exhigh'
    let ok = 0
    let fail = 0
    for (let i = 0; i < list.length; i++) {
      const t = list[i]
      setMessage(`批量下载 ${i + 1}/${list.length}：${t.name}`)
      try {
        const res = await window.eApi.songUrl(t.id, pref)
        if (!res?.url) { fail++; continue }
        const r: any = await window.eApi.downloadSong({
          url: res.url,
          name: t.name,
          artist: t.artists.map((a) => a.name).join('/'),
          type: res.type || 'mp3'
        })
        if (r?.file) ok++; else fail++
      } catch {
        fail++
      }
    }
    setMessage(`批量下载完成：成功 ${ok} 首${fail ? `，失败 ${fail} 首` : ''}`)
  }, [setMessage])

  const batchLike = useCallback(async (list: Track[]) => {
    if (!list.length) return
    if (!profile) { setMessage('登录网易云账号后即可收藏歌曲'); openLogin(); return }
    let n = 0
    for (const t of list) {
      if (likedSetRef.current.has(t.id)) continue
      await toggleLike(t)
      n++
    }
    setMessage(n ? `已批量收藏 ${n} 首歌曲` : '所选歌曲均已收藏')
  }, [profile, openLogin, toggleLike, setMessage])

  const logout = useCallback(async () => {
    await window.eApi.logout()
    setProfileState(null)
    setPlaylists([])
    setTracks([])
    setCurrentPlaylistId(null)
    audio?.pause()
    setPlayer((p) => ({ ...p, current: null, isPlaying: false, playlist: [] }))
    setView('discover')
  }, [])

  // 绑定 audio 事件
  useEffect(() => {
    if (!audio) return
    const onTime = () => setPlayer((p) => ({ ...p, currentTime: audio.currentTime }))
    const onLoaded = () => setPlayer((p) => ({ ...p, duration: audio.duration || 0 }))
    const onPlay = () => {
      syncAudioGraph(customizationRef.current)
      setPlayer((p) => ({ ...p, isPlaying: true }))
    }
    const onPause = () => setPlayer((p) => ({ ...p, isPlaying: false }))
    const onEnded = () => {
      const curTrack = playerRef.current.current
      if (curTrack && fmIdsRef.current.has(curTrack.id)) { fmNextRef.current(); return }
      const mode = playModeRef.current
      if (mode === 'single') {
        audio.currentTime = 0
        audio.play().catch(() => {})
      } else {
        nextTrackRef.current()
      }
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('durationchange', onLoaded)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    // timeupdate 约 250ms 一次，逐字歌词会明显滞后；播放时用 100ms 补帧
    const syncTimer = setInterval(() => {
      if (!audio.paused) setPlayer((p) => ({ ...p, currentTime: audio.currentTime }))
    }, 100)
    return () => {
      clearInterval(syncTimer)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('durationchange', onLoaded)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  const nextTrackRef = useRef(nextTrack)
  nextTrackRef.current = nextTrack

  // 推送歌词与播放状态到桌面歌词悬浮窗（每帧携带逐字进度）
  useEffect(() => {
    if (!desktopLyrics.enabled) return
    const activeIdx = findActiveIndex(lyricLines, player.currentTime)
    const activeLine = activeIdx >= 0 ? lyricLines[activeIdx] : undefined
    const wp = computeWordProgress(activeLine, player.currentTime)
    const lines = lyricLines.map((l) => ({
      text: l.text,
      translation: l.translation,
      words: l.words ? l.words.map((w) => ({ text: w.text, time: w.time, end: w.end })) : undefined
    }))
    const payload = {
      lines,
      active: activeIdx,
      wordFilled: wp.filled,
      wordActive: wp.activeWord,
      wordRatio: wp.wordRatio,
      lineTime: activeLine?.time || 0,
      lineEnd: activeLine?.end || 0,
      playTime: player.currentTime,
      title: player.current?.name || '',
      artist: player.current?.artists?.map((a) => a.name).join(' / ') || '',
      cover: coverUrl(player.current?.album?.picUrl, 300),
      isPlaying: player.isPlaying,
      progress: player.duration > 0 ? player.currentTime / player.duration : 0,
      showTranslation: customization.showTranslation
    }
    window.eApi.lyrics.push(payload)
  }, [desktopLyrics.enabled, lyricLines, player.currentTime, player.current, player.isPlaying, player.duration, customization.showTranslation])

  const value: AppContextValue = {
    profile, isLoggedIn: !!profile, authReady,
    loginOpen, openLogin, disclaimerOpen, acceptDisclaimer, declineDisclaimer,
    setProfile, logout,
    playlists, currentPlaylistId, loadPlaylists, openPlaylist, openArtist, openAlbum, tracks, playlistName, playlistLoading,
    player, playTrack, togglePlay, nextTrack, prevTrack, seek, setVolume, setPlayMode,
    lyricLines, songUrlLoading, message, setMessage,
    quality, setQuality, currentQuality, currentQualityInfo,
    view, setView,
    immersive, setImmersive,
    theme, setTheme,
    desktopLyrics, toggleDesktopLyrics, updateDesktopLyrics,
    searchKeyword, loadSearchSection, searchResults, searching, searchError, doSearch,
    searchHistory, clearSearchHistory, removeSearchHistory,
    accounts, switchAccount, removeAccount, refreshAccounts, locale, t,
    historyTracks, loadHistory,
    customization, setCustomization, chooseBg, bgData,
    toggleLike, isLiked, addToPlaylist, createPlaylist, deletePlaylist,
    batchDownload, batchLike, batchAddToPlaylist, batchRemoveFromPlaylist,
    downloadTrack, downloadDialog, confirmDownload, closeDownload,
    fmMode, fmTracks, fmLoading, fmNext, openFm, loadFm, playFmTrack, comments, loadComments, postComment,
    radioPrograms, radioLoading,
    radios, radiosLoading, loadRadios, loadRadioPrograms, activeRadio, setActiveRadio,
    radioCats, activeCat, setActiveCat, loadRadioCats,
    aggCats,
    localTracks, localLoading, scanLocal, openLocalFiles,
    radioStations, netRadioLoading, radioQuery, setRadioQuery, loadRadioStations,
    radioCountries, radioTags, currentStation, playRadioStation, stopRadio,
    transcripts, transcriptActive, setTranscriptActive: toggleTranscript
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
