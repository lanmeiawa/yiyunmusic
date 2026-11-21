/**
 * 轻量多语言：中文 / 英文。
 * 通过 store 的 customization.language 驱动，切换后立即生效并持久化。
 */
export type Locale = 'zh' | 'en'

export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' }
]

type Vars = Record<string, string | number>

const zh: Record<string, string> = {
  'nav.discover': '发现音乐',
  'nav.lyrics': '动态歌词',
  'nav.history': '最近播放',
  'nav.local': '本地音乐',
  'nav.radio': '听书电台',
  'nav.profile': '个人主页',
  'nav.settings': '个性化设置',
  'nav.library': '音乐库',
  'nav.system': '系统',
  'nav.myPlaylists': '我的歌单',
  'nav.mine': '我的',
  'nav.fm': '私人 FM',

  'side.login': '登录',
  'side.loginHint': '登录后显示歌单',
  'side.logout': '退出登录',
  'side.accounts': '切换账号',
  'side.addAccount': '添加账号',
  'side.noAccounts': '暂无已保存账号',
  'side.current': '当前账号',

  'player.play': '播放',
  'player.pause': '暂停',
  'player.prev': '上一首',
  'player.next': '下一首',
  'player.queue': '播放队列',
  'player.lyrics': '歌词',
  'player.desktopLyrics': '桌面歌词',
  'player.quality': '播放音质',
  'player.rate': '播放倍速',
  'player.volume': '音量',
  'player.mode.loop': '列表循环',
  'player.mode.single': '单曲循环',
  'player.mode.shuffle': '随机播放',

  'quality.standard': '标准',
  'quality.higher': '较高',
  'quality.exhigh': '极高',
  'quality.lossless': '无损',
  'quality.hires': 'Hi-Res',
  'quality.jymaster': '母带',

  'search.placeholder': '搜索音乐、歌单、歌手',
  'search.history': '搜索历史',
  'search.clear': '清空',
  'search.hot': '网易云热搜',
  'search.suggest': '搜索建议',
  'search.empty': '没有找到相关内容',
  'search.emptyHint': '换个关键词试试吧',
  'search.error': '搜索遇到问题',
  'search.retry': '重新搜索',
  'search.results': '找到 {count} 条相关内容',
  'search.searching': '正在搜索…',
  'search.title': '搜索「{keyword}」',

  'discover.night': '夜深了',
  'discover.morning': '早上好',
  'discover.noon': '中午好',
  'discover.afternoon': '下午好',
  'discover.evening': '晚上好',
  'discover.daily': '每日推荐',
  'discover.dailySub': '{count} 首为你定制',
  'discover.chart': '热歌排行榜',
  'discover.chartSub': '全网最热单曲',
  'discover.radio': '听书电台',
  'discover.radioSub': '热门节目随时听',
  'discover.local': '本地音乐',
  'discover.localSub': '扫描本机音频播放',

  'download.title': '下载「{name}」',
  'download.fetching': '正在通过接口获取可用音质…',
  'download.start': '开始下载',
  'download.preparing': '准备中…',
  'download.cancel': '取消',
  'download.noSource': '该歌曲暂无可用音源，可能受版权或地区限制',
  'download.tip': '音质等级、码率与文件大小均由接口实时返回；实际可用性取决于歌曲版权与账号权益，会员歌曲非会员可能只能试听。',

  'settings.language': '界面语言',
  'settings.languageHint': '切换后立即生效，下次启动保持',

  'common.cancel': '取消',
  'common.confirm': '确定',
  'common.close': '关闭',
  'common.retry': '重试',
  'common.loading': '加载中…'
}

const en: Record<string, string> = {
  'nav.discover': 'Discover',
  'nav.lyrics': 'Live Lyrics',
  'nav.history': 'Recently Played',
  'nav.local': 'Local Music',
  'nav.radio': 'Radio',
  'nav.profile': 'Profile',
  'nav.settings': 'Settings',
  'nav.library': 'Library',
  'nav.system': 'System',
  'nav.myPlaylists': 'My Playlists',
  'nav.mine': 'Mine',
  'nav.fm': 'Personal FM',

  'side.login': 'Sign in',
  'side.loginHint': 'Sign in to see playlists',
  'side.logout': 'Sign out',
  'side.accounts': 'Switch account',
  'side.addAccount': 'Add account',
  'side.noAccounts': 'No saved accounts',
  'side.current': 'Current',

  'player.play': 'Play',
  'player.pause': 'Pause',
  'player.prev': 'Previous',
  'player.next': 'Next',
  'player.queue': 'Queue',
  'player.lyrics': 'Lyrics',
  'player.desktopLyrics': 'Desktop lyrics',
  'player.quality': 'Audio quality',
  'player.rate': 'Playback speed',
  'player.volume': 'Volume',
  'player.mode.loop': 'Repeat all',
  'player.mode.single': 'Repeat one',
  'player.mode.shuffle': 'Shuffle',

  'quality.standard': 'Standard',
  'quality.higher': 'Higher',
  'quality.exhigh': 'High',
  'quality.lossless': 'Lossless',
  'quality.hires': 'Hi-Res',
  'quality.jymaster': 'Master',

  'search.placeholder': 'Search songs, playlists, artists',
  'search.history': 'Recent searches',
  'search.clear': 'Clear',
  'search.hot': 'Trending on NetEase',
  'search.suggest': 'Suggestions',
  'search.empty': 'No results found',
  'search.emptyHint': 'Try a different keyword',
  'search.error': 'Search failed',
  'search.retry': 'Retry',
  'search.results': '{count} results',
  'search.searching': 'Searching…',
  'search.title': 'Search “{keyword}”',

  'discover.night': 'Good night',
  'discover.morning': 'Good morning',
  'discover.noon': 'Good noon',
  'discover.afternoon': 'Good afternoon',
  'discover.evening': 'Good evening',
  'discover.daily': 'Daily Mix',
  'discover.dailySub': '{count} songs picked for you',
  'discover.chart': 'Top Charts',
  'discover.chartSub': 'Hottest tracks online',
  'discover.radio': 'Radio',
  'discover.radioSub': 'Popular shows anytime',
  'discover.local': 'Local Music',
  'discover.localSub': 'Scan and play local audio',

  'download.title': 'Download “{name}”',
  'download.fetching': 'Fetching available qualities…',
  'download.start': 'Start download',
  'download.preparing': 'Preparing…',
  'download.cancel': 'Cancel',
  'download.noSource': 'No source available for this track (copyright or region restriction)',
  'download.tip': 'Quality, bitrate and file size are returned by the API in real time. Availability depends on copyright and account privileges.',

  'settings.language': 'Language',
  'settings.languageHint': 'Takes effect immediately and is saved for next launch',

  'common.cancel': 'Cancel',
  'common.confirm': 'OK',
  'common.close': 'Close',
  'common.retry': 'Retry',
  'common.loading': 'Loading…'
}

export function translate(locale: Locale, key: string, vars?: Vars): string {
  const dict = locale === 'en' ? en : zh
  let text = dict[key] ?? zh[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.split(`{${k}}`).join(String(v))
    }
  }
  return text
}

/** 音质等级 → 本地化名称 */
export function qualityLabel(locale: Locale, level: string): string {
  const key = `quality.${level}`
  const text = translate(locale, key)
  return text === key ? level : text
}
