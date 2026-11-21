import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // 环境判断
  isDesktopLyrics: () => window.location.hash.includes('desktop-lyrics'),

  // 通用接口
  call: (name: string, params?: Record<string, any>) => ipcRenderer.invoke('api:call', name, params),

  // 登录
  qrKey: () => ipcRenderer.invoke('auth:qrkey'),
  qrCreate: (key: string) => ipcRenderer.invoke('auth:qrcreate', key),
  qrCheck: (key: string) => ipcRenderer.invoke('auth:qrcheck', key),
  profile: () => ipcRenderer.invoke('auth:profile'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  // 多账号
  accountsList: () => ipcRenderer.invoke('accounts:list'),
  accountsSwitch: (id: string) => ipcRenderer.invoke('accounts:switch', id),
  accountsRemove: (id: string) => ipcRenderer.invoke('accounts:remove', id),

  // 歌曲
  songUrl: (id: number, level?: string) => ipcRenderer.invoke('song:url', id, level),
  // 实时探测歌曲可用音质（实际等级 / 码率 / 格式 / 大小）
  songQualities: (id: number) => ipcRenderer.invoke('song:qualities', id),
  // 多级兜底搜索（云搜索 → 旧搜索 → 建议词）
  smartSearch: (keyword: string) => ipcRenderer.invoke('search:smart', keyword),
  // 音频流代理（供 Web Audio 频谱分析与均衡器使用）
  audioRegister: (url: string) => ipcRenderer.invoke('audio:register', url),
  audioRegisterLocal: (filePath: string) => ipcRenderer.invoke('audio:register-local', filePath),

  // 图片代理兜底（封面加载失败时用）
  imageProxy: (url: string) => ipcRenderer.invoke('img:proxy', url),

  // 个性化设置
  customBgSelect: () => ipcRenderer.invoke('custom:select-bg'),

  // 有声书全量聚合（分页遍历 + 缓存）
  djFetchAll: () => ipcRenderer.invoke('dj:fetch-all'),

  // 自定义应用图标
  customIconSelect: () => ipcRenderer.invoke('custom-icon-select'),

  // 本地音乐扫描
  localScan: () => ipcRenderer.invoke('local:scan'),
  localMeta: (filePath: string) => ipcRenderer.invoke('local:meta', filePath),
  localOpen: () => ipcRenderer.invoke('local:open'),
  onDjProgress: (cb: (p: { msg: string; n: number }) => void) => {
    const handler = (_e: any, p: { msg: string; n: number }) => cb(p)
    ipcRenderer.on('dj:progress', handler)
    return () => ipcRenderer.removeListener('dj:progress', handler)
  },

  // 全局快捷键动作（主进程 globalShortcut 转发）
  onGlobalAction: (cb: (action: string) => void) => {
    const handler = (_e: any, action: string) => cb(action)
    ipcRenderer.on('player:global-action', handler)
    return () => ipcRenderer.removeListener('player:global-action', handler)
  },
  customBgData: () => ipcRenderer.invoke('custom:bg-data'),
  customSet: (patch: Record<string, any>) => ipcRenderer.invoke('custom:set', patch),
  // 快捷键即时应用，返回注册失败的动作名数组
  shortcutsApply: () => ipcRenderer.invoke('shortcuts:apply'),

  // 下载
  downloadSelectDir: () => ipcRenderer.invoke('download:select-dir'),
  downloadSong: (opts: { url: string; name: string; artist: string; type: string }) => ipcRenderer.invoke('download:song', opts),

  // 本地状态
  store: {
    get: () => ipcRenderer.invoke('store:get'),
    setVolume: (v: number) => ipcRenderer.invoke('store:volume', v),
    getCookie: () => ipcRenderer.invoke('store:cookie'),
    setCookie: (c: string) => ipcRenderer.invoke('store:setcookie', c),
    setTheme: (t: string) => ipcRenderer.invoke('store:theme', t),
    setQuality: (q: string) => ipcRenderer.invoke('store:quality', q)
  },

  // 桌面歌词
  lyrics: {
    open: () => ipcRenderer.invoke('lyrics:open'),
    close: () => ipcRenderer.invoke('lyrics:close'),
    settings: (patch: Record<string, any>) => ipcRenderer.invoke('lyrics:settings', patch),
    getSettings: () => ipcRenderer.invoke('lyrics:getsettings'),
    lock: (locked: boolean) => ipcRenderer.invoke('lyrics:lock', locked),
    // 主界面推送歌词
    push: (payload: Record<string, any>) => ipcRenderer.send('lyrics:push', payload),
    // 歌词窗监听
    onUpdate: (cb: (payload: any) => void) => {
      const handler = (_e: any, payload: any) => cb(payload)
      ipcRenderer.on('lyrics:update', handler)
      return () => ipcRenderer.removeListener('lyrics:update', handler)
    },
    onSettings: (cb: (settings: any) => void) => {
      const handler = (_e: any, s: any) => cb(s)
      ipcRenderer.on('lyrics:settings', handler)
      return () => ipcRenderer.removeListener('lyrics:settings', handler)
    },
    // 歌词窗接收主题同步（主进程切主题时广播）
    onTheme: (cb: (t: string) => void) => {
      const handler = (_e: any, t: string) => cb(t)
      ipcRenderer.on('lyrics:theme', handler)
      return () => ipcRenderer.removeListener('lyrics:theme', handler)
    },
    // 主界面监听歌词窗 enabled 状态同步（歌词窗内关闭/托盘操作时）
    onEnabledSync: (cb: (enabled: boolean) => void) => {
      const handler = (_e: any, enabled: boolean) => cb(enabled)
      ipcRenderer.on('lyrics:enabled-sync', handler)
      return () => ipcRenderer.removeListener('lyrics:enabled-sync', handler)
    },
    request: () => ipcRenderer.invoke('lyrics:request'),
    minimizeSize: () => ipcRenderer.send('lyrics:minimize-size'),
    // JS 拖动（mousedown 触发开始，mouseup 通知结束）
    moveStart: () => ipcRenderer.send('lyrics:move-start'),
    moveEnd: () => ipcRenderer.send('lyrics:move-end'),
    // 窗口宽度调整（等比）
    resize: (dw: number) => ipcRenderer.send('lyrics:resize', dw),
    // 预设尺寸（单行 / 两行 / 三行 …）
    setSize: (w: number, h: number) => ipcRenderer.send('lyrics:set-size', w, h),
    // 歌词窗自身窗口控制
    winClose: () => ipcRenderer.send('lyrics:win-close'),
    winHide: () => ipcRenderer.send('lyrics:win-hide')
  },

  // 窗口控制
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
    quit: () => ipcRenderer.send('app:quit'),
    setFullScreen: (on: boolean) => ipcRenderer.send('win:set-fullscreen', on),
    // 系统级退出全屏（如 Esc）时由主进程通知，渲染层同步移除沉浸布局
    onFullscreenLeft: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('fullscreen:left', handler)
      return () => ipcRenderer.removeListener('fullscreen:left', handler)
    },
    isMax: () => ipcRenderer.invoke('win:ismax')
  }
}

contextBridge.exposeInMainWorld('eApi', api)

export type EApi = typeof api

declare global {
  interface Window {
    eApi: EApi
  }
}
