import { app, BrowserWindow, ipcMain, session, shell, screen, Tray, Menu, nativeImage, globalShortcut, dialog } from 'electron'
import { join } from 'node:path'
import fs from 'node:fs'
import path from 'node:path'
import {
  initStore, getStore, setVolume, clearSession, getCookie, setCookie,
  setTheme, setQuality, setDesktopLyrics, setCustomization, setWindowBounds,
  DEFAULT_SHORTCUTS, type ThemeName, type Customization, type ShortcutMap,
  getAccounts, removeAccountById
} from './store'
import {
  callApi,
  qrLoginKey,
  qrLoginCreate,
  qrLoginCheck,
  refreshProfile,
  doLogout,
  getSongUrl,
  getSongQualities,
  clearQualityCache,
  smartSearch,
  switchAccount,
  fetchFmBatch,
  searchSection
} from './api'
import { startAudioProxy, stopAudioProxy, registerAudioUrl, registerLocalAudio, hlsProxyUrl, probeStream } from './audio-proxy'
import { registerAsrIpc } from './asr'

let mainWindow: BrowserWindow | null = null
let lyricsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let lastLyricsPayload: any = null
let quitting = false

/**
 * 应用更名为 yiyunmusic 后，userData 目录随之变化；
 * 首次启动时把旧的「yiyunmusic」数据（登录态 / 设置 / 缓存）迁移过来。
 */
function migrateUserData() {
  if (process.platform !== 'win32') return
  try {
    const appData = app.getPath('appData')
    const newDir = path.join(appData, 'yiyunmusic')
    // 新版已有配置则不再迁移，避免覆盖用户当前设置
    if (fs.existsSync(path.join(newDir, 'yiyun-store.json'))) return

    // 依次兼容：旧中文产品名 / 旧英文包名 / 手动备份目录
    const oldDir = ['亦云音乐', 'yiyun-music', 'yiyunmusic-old']
      .map((name) => path.join(appData, name))
      .find((dir) => fs.existsSync(path.join(dir, 'yiyun-store.json')))
    if (!oldDir) return

    fs.mkdirSync(newDir, { recursive: true })
    // 只迁移有意义的数据，跳过 Cache/GPUCache 等临时目录
    for (const item of ['yiyun-store.json', 'app-icon.png', 'app-icon.ico', 'dj-cache.json', 'backgrounds']) {
      const src = path.join(oldDir, item)
      if (!fs.existsSync(src)) continue
      fs.cpSync(src, path.join(newDir, item), { recursive: true, force: false })
    }
    console.log('[migrate] 已从旧版目录迁移登录态与个性化设置:', oldDir)
  } catch (e: any) {
    console.warn('[migrate] 用户数据迁移失败:', e?.message || e)
  }
}
migrateUserData()

/**
 * GPU 硬件加速：Chromium 要求这些开关在 app ready 之前注入。
 * 此时 store 模块尚未初始化，因此直接读磁盘配置；缺省或读取失败时按开启处理。
 */
function configureGpuAcceleration() {
  let enabled = true
  try {
    const cfg = path.join(app.getPath('userData'), 'yiyun-store.json')
    if (fs.existsSync(cfg)) {
      const parsed = JSON.parse(fs.readFileSync(cfg, 'utf-8'))
      const v = parsed?.customization?.gpuAcceleration
      if (typeof v === 'boolean') enabled = v
    }
  } catch { /* 配置异常时保持默认开启 */ }

  if (!enabled) {
    console.info('[gpu] 硬件加速已关闭（软件渲染模式）')
    return
  }
  app.commandLine.appendSwitch('enable-accelerated-2d-canvas', '1')
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('enable-zero-copy')
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization')
  console.info('[gpu] 已启用 2D Canvas 硬件加速 / GPU 光栅化 / 零拷贝')
}
configureGpuAcceleration()

/** FLAC → MP3 转码（320kbps），成功返回 true */
async function convertFlacToMp3(input: string, output: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegPath: string = require('ffmpeg-static')
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      console.warn('[convert] ffmpeg 不可用')
      return false
    }
    const { execFile } = require('node:child_process')
    await new Promise<void>((resolve, reject) => {
      execFile(ffmpegPath, ['-y', '-i', input, '-codec:a', 'libmp3lame', '-q:a', '0', '-loglevel', 'error', output], { timeout: 300000, windowsHide: true }, (err: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })
    return fs.existsSync(output) && fs.statSync(output).size > 4096
  } catch (e: any) {
    console.error('[convert] FLAC→MP3 失败:', e?.message || e)
    return false
  }
}

// 图片代理缓存：url → dataURL（封面直连失败时兜底）
const imageCache = new Map<string, string>()

/** 主进程代理下载图片：带 Referer/UA，绕过渲染层网络限制；10s 超时，限制 6MB */
async function proxyImage(rawUrl: string): Promise<string> {
  if (!rawUrl || typeof rawUrl !== 'string' || !/^https?:\/\//i.test(rawUrl)) return ''
  const cached = imageCache.get(rawUrl)
  if (cached) return cached
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    const res = await fetch(rawUrl, {
      signal: ctrl.signal,
      headers: {
        'Referer': 'https://music.163.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
      }
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 6 * 1024 * 1024) throw new Error('too large')
    const type = res.headers.get('content-type') || 'image/jpeg'
    const dataUrl = `data:${type};base64,${buf.toString('base64')}`
    if (imageCache.size > 300) imageCache.clear()
    imageCache.set(rawUrl, dataUrl)
    return dataUrl
  } catch (e: any) {
    console.warn('[img:proxy] 下载失败:', rawUrl.slice(0, 60), e?.message || e)
    return ''
  }
}

function loadRenderer(win: BrowserWindow, hash = '') {
  const dev = process.env['ELECTRON_RENDERER_URL']
  const file = join(__dirname, '../renderer/index.html')
  const h = hash ? hash.replace('#', '') : ''
  if (dev) {
    win.loadURL(dev + (h ? '#' + h : ''))
  } else {
    // Electron loadFile(filePath, options)：hash 放在 options 里
    win.loadFile(file, h ? { hash: h } : {})
  }
}

function createWindow() {
  // 窗口位置/大小记忆：恢复上次状态，越界时自动回退默认
  const bounds = getStore().windowBounds
  const display = screen.getPrimaryDisplay().workAreaSize
  const wb = bounds && bounds.width && bounds.x !== undefined &&
    bounds.x > -bounds.width + 120 && bounds.x < display.width - 120 &&
    bounds.y > -bounds.height + 60 && bounds.y < display.height - 60
    ? bounds : undefined
  mainWindow = new BrowserWindow({
    width: wb?.width || 1280,
    height: wb?.height || 820,
    x: wb?.x,
    y: wb?.y,
    minWidth: 940,
    minHeight: 640,
    icon: appIconPath(), // 开发态窗口/任务栏图标（打包后使用 exe 内嵌 ico）
    frame: false, // 无边框，自定义标题栏
    transparent: false,
    backgroundColor: getStore().theme === 'dark' ? '#1a1b26' : '#f7f8fc',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  loadRenderer(mainWindow)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (!getStore().windowBounds) mainWindow?.center()
  })

  // 窗口位置/大小变化时防抖保存
  let boundsTimer: any = null
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFullScreen()) return
    clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      const b = mainWindow.getBounds()
      setWindowBounds({ ...b, maximized: mainWindow.isMaximized() })
    }, 500)
  }
  mainWindow.on('move', saveBounds)
  mainWindow.on('resize', saveBounds)
  mainWindow.on('maximize', saveBounds)
  mainWindow.on('unmaximize', saveBounds)
  // 用户按 Esc 等系统级退出全屏时，同步渲染层移除沉浸布局
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('fullscreen:left')
  })

  // 点击 ✕ 隐藏到托盘（后台继续播放），托盘右键「退出」才真正退出
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

/** 创建桌面歌词悬浮窗：透明、无边框、置顶、JS 拖动（不依赖 CSS app-region，规避 transform 失效问题） */
function createLyricsWindow() {
  if (lyricsWindow && !lyricsWindow.isDestroyed()) {
    lyricsWindow.show()
    return
  }
  const settings = getStore().desktopLyrics
  const display = screen.getPrimaryDisplay().workAreaSize
  const w = Math.max(400, Math.min(1200, settings.width || 640))
  const h = Math.max(90, Math.min(420, settings.height || 150))

  // 坐标越界校验：持久化位置若已不在可见屏幕内（如换了分辨率/副屏），
  // 自动重置到默认位置，避免"点了开关却看不到窗口"
  const inScreen =
    typeof settings.x === 'number' && typeof settings.y === 'number' &&
    settings.x > -w + 80 && settings.x < display.width - 80 &&
    settings.y > -h + 40 && settings.y < display.height - 40
  const posX = inScreen ? settings.x : Math.round((display.width - w) / 2)
  const posY = inScreen ? settings.y : Math.round(display.height * 0.72)
  if (!inScreen) setDesktopLyrics({ x: posX, y: posY })

  lyricsWindow = new BrowserWindow({
    width: w,
    height: h,
    x: posX,
    y: posY,
    minWidth: 360,
    minHeight: 90,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: false,
    opacity: settings.opacity ?? 0.85,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  loadRenderer(lyricsWindow, '#desktop-lyrics')

  // 位置/大小变化时防抖持久化
  let saveTimer: any = null
  const persistNow = () => {
    if (!lyricsWindow || lyricsWindow.isDestroyed()) return
    const [x, y] = lyricsWindow.getPosition()
    const [bw, bh] = lyricsWindow.getSize()
    setDesktopLyrics({ x, y, width: bw, height: bh })
  }
  const persistPos = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(persistNow, 400)
  }
  lyricsWindow.on('moved', persistPos)
  lyricsWindow.on('resized', persistPos)

  // 锁定态：鼠标穿透
  applyLyricsLock(settings.locked)

  lyricsWindow.on('closed', () => {
    lyricsWindow = null
  })
}

/** JS 拖动状态：渲染层 mousedown 触发，主进程以 60fps 跟随光标移动窗口 */
let dragTimer: any = null
let dragOffset = { x: 0, y: 0 }

function startLyricsDrag() {
  if (!lyricsWindow || lyricsWindow.isDestroyed()) return
  const cursor = screen.getCursorScreenPoint()
  const [wx, wy] = lyricsWindow.getPosition()
  dragOffset = { x: cursor.x - wx, y: cursor.y - wy }
  stopLyricsDragTimer()
  dragTimer = setInterval(() => {
    if (!lyricsWindow || lyricsWindow.isDestroyed()) { stopLyricsDragTimer(); return }
    const p = screen.getCursorScreenPoint()
    lyricsWindow.setPosition(p.x - dragOffset.x, p.y - dragOffset.y)
  }, 16)
}

function stopLyricsDragTimer() {
  if (dragTimer) { clearInterval(dragTimer); dragTimer = null }
}

function endLyricsDrag() {
  stopLyricsDragTimer()
  // 拖动结束立即保存位置
  if (lyricsWindow && !lyricsWindow.isDestroyed()) {
    const [x, y] = lyricsWindow.getPosition()
    setDesktopLyrics({ x, y })
  }
}

/** 调整歌词窗尺寸（宽度 +/- 按钮），同步持久化 */
/** 按预设设置歌词窗尺寸，并保持窗口完整可见 */
function setLyricsWindowSize(w: number, h: number) {
  if (!lyricsWindow || lyricsWindow.isDestroyed()) return
  const [cx, cy] = lyricsWindow.getPosition()
  const display = screen.getDisplayNearestPoint({ x: cx, y: cy }).workAreaSize
  const nw = Math.max(400, Math.min(1200, Math.round(w)))
  const nh = Math.max(90, Math.min(Math.round(display.height * 0.8), Math.round(h)))
  const nx = Math.max(0, Math.min(display.width - nw, cx))
  const ny = Math.max(0, Math.min(display.height - nh, cy))
  lyricsWindow.setBounds({ x: nx, y: ny, width: nw, height: nh })
  setDesktopLyrics({ width: nw, height: nh, x: nx, y: ny })
}

function resizeLyricsWindow(dw: number) {
  if (!lyricsWindow || lyricsWindow.isDestroyed()) return
  const [w, h] = lyricsWindow.getSize()
  const display = screen.getPrimaryDisplay().workAreaSize
  const nw = Math.max(400, Math.min(1200, w + dw))
  const nh = Math.max(90, Math.min(420, Math.round((h / w) * nw)))
  lyricsWindow.setSize(nw, nh)
  const [x, y] = lyricsWindow.getPosition()
  setDesktopLyrics({ width: nw, height: nh, x, y })
}

function applyLyricsLock(locked: boolean) {
  if (!lyricsWindow || lyricsWindow.isDestroyed()) return
  // 锁定时鼠标完全穿透，点击可穿透到下方窗口（解锁入口：主界面按钮/托盘/快捷键 Ctrl+Alt+L）
  lyricsWindow.setIgnoreMouseEvents(locked, { forward: false })
  lyricsWindow.setResizable(!locked)
  updateTrayMenu()
}

function closeLyricsWindow() {
  stopLyricsDragTimer()
  if (lyricsWindow && !lyricsWindow.isDestroyed()) {
    lyricsWindow.close()
  }
  lyricsWindow = null
}

/** 桌面歌词 enabled 状态变化时同步主界面按钮（歌词窗内 ✕ 关闭、托盘操作等都要同步） */
function syncLyricsEnabled(enabled: boolean) {
  setDesktopLyrics({ enabled })
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lyrics:enabled-sync', enabled)
  }
}

/** 切换桌面歌词锁定（主界面按钮 / 托盘 / 快捷键统一入口）。锁定时窗口鼠标穿透，必须提供解锁出路 */
function setLyricsLocked(locked: boolean) {
  setDesktopLyrics({ locked })
  applyLyricsLock(locked)
  if (lyricsWindow && !lyricsWindow.isDestroyed()) {
    lyricsWindow.webContents.send('lyrics:settings', { ...getStore().desktopLyrics })
  }
  // 同步锁定状态到主界面按钮
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lyrics:settings', { ...getStore().desktopLyrics })
  }
  updateTrayMenu()
}

/** 应用图标路径：用户自定义图标优先，其次打包 resources / 开发态 build 目录 */
function appIconPath(): string {
  const custom = getStore().customization.iconPath
  if (custom && fs.existsSync(custom)) return custom
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../../build/icon.png')
}

const SHORTCUT_NAMES = ['yiyunmusic', '亦云音乐']

/** 生成 PNG 内嵌型 ICO（Windows Vista+ 支持），快捷方式图标必须是 ico/exe/dll */
function buildIcoFromPng(pngPath: string): string {
  try {
    const img = nativeImage.createFromPath(pngPath)
    if (img.isEmpty()) return ''
    const png = img.resize({ width: 256, height: 256, quality: 'best' }).toPNG()
    if (!png.length) return ''
    const header = Buffer.alloc(22)
    header.writeUInt16LE(0, 0) // reserved
    header.writeUInt16LE(1, 2) // type: icon
    header.writeUInt16LE(1, 4) // count
    header.writeUInt8(0, 6) // width 0 = 256
    header.writeUInt8(0, 7) // height 0 = 256
    header.writeUInt8(0, 8) // color count
    header.writeUInt8(0, 9) // reserved
    header.writeUInt16LE(1, 10) // planes
    header.writeUInt16LE(32, 12) // bit count
    header.writeUInt32LE(png.length, 14)
    header.writeUInt32LE(22, 18)
    const icoPath = path.join(app.getPath('userData'), 'app-icon.ico')
    fs.writeFileSync(icoPath, Buffer.concat([header, png]))
    return icoPath
  } catch (e: any) {
    console.warn('[icon] ICO 生成失败:', e?.message || e)
    return ''
  }
}

/** 同步桌面与开始菜单快捷方式图标，并刷新资源管理器图标缓存 */
function updateShortcutIcons(customPath?: string) {
  if (process.platform !== 'win32') return
  let iconFile = process.execPath
  let iconIndex = 0
  if (customPath && fs.existsSync(customPath)) {
    const ico = buildIcoFromPng(customPath)
    if (ico) { iconFile = ico; iconIndex = 0 }
  }
  const dirs = [
    app.getPath('desktop'),
    path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ]
  for (const dir of dirs) {
    for (const name of SHORTCUT_NAMES) {
      const lnk = path.join(dir, `${name}.lnk`)
      try {
        if (!fs.existsSync(lnk)) continue
        const old = shell.readShortcutLink(lnk)
        shell.writeShortcutLink(lnk, 'update', {
          target: old.target,
          args: old.args,
          cwd: old.cwd || path.dirname(old.target),
          icon: iconFile,
          iconIndex,
          description: old.description || name,
          appUserModelId: old.appUserModelId
        })
        console.log('[icon] 快捷方式图标已更新:', lnk)
      } catch (e: any) {
        console.warn('[icon] 快捷方式更新失败:', lnk, e?.message || e)
      }
    }
  }
  // 让资源管理器立即刷新图标缓存（失败忽略）
  try {
    const { execFile } = require('node:child_process')
    execFile('ie4uinit.exe', ['-show'], () => {})
  } catch { /* ignore */ }
}

/** 图标更换后即时同步主窗口、托盘与桌面快捷方式 */
function applyAppIcon(iconPath?: string) {
  const target = iconPath && fs.existsSync(iconPath) ? iconPath : appIconPath()
  try {
    const img = nativeImage.createFromPath(target)
    if (img.isEmpty()) return
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setIcon(img)
    if (tray && !tray.isDestroyed()) {
      const small = img.resize({ width: 16, height: 16 })
      if (!small.isEmpty()) tray.setImage(small)
    }
  } catch (e: any) {
    console.error('[icon] 应用图标失败:', e?.message || e)
  }
  updateShortcutIcons(iconPath && fs.existsSync(iconPath) ? iconPath : undefined)
}

/** 系统托盘 */
function createTray() {
  try {
    const icon = nativeImage.createFromPath(appIconPath()).resize({ width: 16, height: 16 })
    if (icon.isEmpty()) {
      console.error('[tray] 图标读取失败:', appIconPath())
      return
    }
    tray = new Tray(icon)
    updateTrayMenu()
    tray.setToolTip(getStore().customization.appName || 'yiyunmusic')
    tray.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  } catch (e) {
    console.error('[tray] 创建失败', e)
  }
}

function updateTrayMenu() {
  if (!tray) return
  const s = getStore().desktopLyrics
  const menu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    {
      label: s.enabled ? '关闭桌面歌词' : '开启桌面歌词',
      click: () => {
        if (s.enabled) { closeLyricsWindow(); syncLyricsEnabled(false) }
        else { syncLyricsEnabled(true); createLyricsWindow() }
      }
    },
    ...(s.enabled && s.locked
      ? [{ label: '解锁桌面歌词（可拖动）', click: () => setLyricsLocked(false) }]
      : []),
    { type: 'separator' },
    {
      label: '退出',
      click: () => { quitting = true; app.quit() }
    }
  ])
  tray.setContextMenu(menu)
}

/** 广播歌词数据到桌面歌词窗 */
function broadcastLyrics(payload: any) {
  if (lyricsWindow && !lyricsWindow.isDestroyed()) {
    lyricsWindow.webContents.send('lyrics:update', payload)
  }
}

/**
 * 按用户配置注册全局快捷键（先全部注销再注册，修改后即时生效）。
 * 返回注册失败的动作名，便于界面提示被系统/其他程序占用。
 */
function registerGlobalShortcuts(): (keyof ShortcutMap)[] {
  globalShortcut.unregisterAll()
  const cfg = { ...DEFAULT_SHORTCUTS, ...(getStore().customization.shortcuts || {}) }
  const gAct = (action: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('player:global-action', action)
  }
  const handlers: Record<keyof ShortcutMap, () => void> = {
    togglePlay: () => gAct('toggle-play'),
    next: () => gAct('next'),
    prev: () => gAct('prev'),
    volumeUp: () => gAct('vol-up'),
    volumeDown: () => gAct('vol-down'),
    lockLyrics: () => setLyricsLocked(!getStore().desktopLyrics.locked)
  }
  const failed: (keyof ShortcutMap)[] = []
  for (const key of Object.keys(handlers) as (keyof ShortcutMap)[]) {
    const accel = cfg[key]
    if (!accel) continue
    try {
      if (!globalShortcut.register(accel, handlers[key])) failed.push(key)
    } catch {
      failed.push(key)
    }
  }
  if (failed.length) console.warn('[shortcut] 以下快捷键注册失败（可能被占用）:', failed.join(', '))
  return failed
}

function setupIpc() {
  // 通用接口调用
  ipcMain.handle('api:call', async (_e, name, params) => {
    return callApi(name, params)
  })

  // 私人 FM：一次凑够 N 首（接口每次只给 3 首）
  ipcMain.handle('fm:batch', async (_e, limit?: number) => {
    try {
      return await fetchFmBatch(Number(limit) || 50)
    } catch (e: any) {
      return { error: e?.message || String(e) }
    }
  })

  // 开机自启（Windows/macOS 登录项）
  ipcMain.handle('app:auto-launch', (_e, on: boolean) => {
    try {
      const opts = { path: process.execPath, args: process.defaultApp && process.argv[1] ? [process.argv[1]] : [] }
      app.setLoginItemSettings({ openAtLogin: !!on, ...opts })
      // Windows 需要带同样的 path/args 查询，否则匹配不到刚写入的启动项
      return app.getLoginItemSettings(opts).openAtLogin
    } catch (e: any) { console.error('[auto-launch]', e?.message || e); return false }
  })

  // 扫码登录三步
  ipcMain.handle('auth:qrkey', async () => qrLoginKey())
  ipcMain.handle('auth:qrcreate', async (_e, key) => qrLoginCreate(key))
  ipcMain.handle('auth:qrcheck', async (_e, key) => {
    const r = await qrLoginCheck(key)
    // 登录成功后账号权益变化，清空音质探测缓存
    if (r?.code === 803) clearQualityCache()
    return r
  })
  ipcMain.handle('auth:profile', async () => refreshProfile())
  // 多账号管理
  ipcMain.handle('accounts:list', () => getAccounts().map(({ cookie, ...rest }) => rest))
  ipcMain.handle('accounts:switch', async (_e, id: string) => {
    const res = await switchAccount(id)
    if (res.ok) clearQualityCache()
    return res
  })
  ipcMain.handle('accounts:remove', (_e, id: string) => removeAccountById(id))

  ipcMain.handle('auth:logout', async () => {
    await doLogout()
    clearSession()
    clearQualityCache()
    return true
  })

  // 播放地址
  ipcMain.handle('song:url', async (_e, id, level) => getSongUrl(id, level))
  // 多级兜底搜索
  // 搜索补充分区（专辑 / 听书 / 歌词）：点开分类时再请求，减少搜索时的请求数
  ipcMain.handle('search:section', async (_e, kw: string, kind: 'albums' | 'shows' | 'lyrics') => {
    try { return await searchSection(kw, kind) } catch (e: any) { return { error: e?.message || '加载失败' } }
  })

  ipcMain.handle('search:smart', async (_e, kw: string) => {
    try {
      return await smartSearch(kw)
    } catch (e: any) {
      return { songs: [], playlists: [], albums: [], artists: [], shows: [], lyricSongs: [], via: '', error: e?.message || '搜索失败' }
    }
  })

  // 实时探测歌曲可用音质（播放展示 / 下载选择共用）
  ipcMain.handle('song:qualities', async (_e, id: number) => {
    try {
      return await getSongQualities(id)
    } catch (e: any) {
      console.warn('[qualities] 查询失败:', e?.message || e)
      return []
    }
  })

  // 音频流代理：让 Web Audio 能读取频谱且不会因跨域而被静音
  ipcMain.handle('audio:register', async (_e, url: string, radio?: boolean) => registerAudioUrl(url, !!radio))
  ipcMain.handle('audio:register-local', async (_e, p: string) => registerLocalAudio(p))

  // 图片代理兜底：封面直连失败时由主进程下载转 base64
  ipcMain.handle('img:proxy', (_e, url: string) => proxyImage(url))

  // ===== 个性化设置 =====
  // 选择本地背景图并复制到 userData/backgrounds/
  ipcMain.handle('custom:select-bg', async () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
    const res = await dialog.showOpenDialog(win as BrowserWindow, {
      title: '选择背景图片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] }]
    })
    if (res.canceled || !res.filePaths.length) return ''
    const src = res.filePaths[0]
    try {
      const dir = path.join(app.getPath('userData'), 'backgrounds')
      fs.mkdirSync(dir, { recursive: true })
      const ext = path.extname(src).toLowerCase() || '.png'
      const dest = path.join(dir, `bg-${Date.now()}${ext}`)
      fs.copyFileSync(src, dest)
      // 只保留最近 5 张，避免堆积
      const olds = fs.readdirSync(dir).map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs)
      while (olds.length > 5) fs.unlinkSync(olds.shift() as string)
      setCustomization({ bgPath: dest })
      return dest
    } catch (e: any) {
      console.error('[custom] 复制背景图失败', e?.message)
      return ''
    }
  })
  // 读取背景图为 dataURL（file:// 页面跨协议加载限制，统一走 IPC）
  ipcMain.handle('custom:bg-data', async () => {
    const p = getStore().customization.bgPath
    if (!p || !fs.existsSync(p)) return ''
    try {
      const buf = fs.readFileSync(p)
      const ext = path.extname(p).slice(1).toLowerCase()
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : 'image/jpeg'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch {
      return ''
    }
  })
  // 保存个性化设置
  ipcMain.handle('custom:set', (_e, patch: Partial<Customization>) => {
    const next = setCustomization(patch)
    // 恢复默认图标时立即换回内置图标
    if (patch.iconPath !== undefined) applyAppIcon(patch.iconPath || undefined)
    // 快捷键变更后即时重新注册
    if (patch.shortcuts !== undefined) registerGlobalShortcuts()
    return next
  })

  // 快捷键即时应用（返回注册失败的动作名）
  ipcMain.handle('shortcuts:apply', () => registerGlobalShortcuts())

  // 自定义应用图标：选图 → 复制到 userData → 更新托盘（窗口图标重启生效）
  ipcMain.handle('custom-icon-select', async () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
    const res = await dialog.showOpenDialog(win as BrowserWindow, {
      title: '选择应用图标（建议正方形图片）',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico'] }]
    })
    if (res.canceled || !res.filePaths.length) return ''
    try {
      const dest = path.join(app.getPath('userData'), 'app-icon.png')
      fs.copyFileSync(res.filePaths[0], dest)
      setCustomization({ iconPath: dest })
      // 托盘与窗口图标即时换新；渲染层随后会同步 customization 更新标题栏
      applyAppIcon(dest)
      return dest
    } catch (e: any) {
      console.error('[icon] 保存失败:', e?.message)
      return ''
    }
  })

  // 本地音乐：选择目录扫描音频文件
  ipcMain.handle('local:scan', async (_e) => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
    const res = await dialog.showOpenDialog(win as BrowserWindow, {
      title: '选择音乐目录',
      properties: ['openDirectory']
    })
    if (res.canceled || !res.filePaths.length) return []
    const dir = res.filePaths[0]
    const exts = ['.mp3', '.flac', '.wav', '.m4a', '.ape', '.ogg', '.aac']
    const out: { path: string; name: string; size: number }[] = []
    const walk = (d: string, depth = 0) => {
      if (depth > 6) return
      let entries: string[] = []
      try { entries = fs.readdirSync(d) } catch { return }
      for (const e of entries) {
        const full = path.join(d, e)
        try {
          const st = fs.statSync(full)
          if (st.isDirectory()) walk(full, depth + 1)
          else if (exts.includes(path.extname(e).toLowerCase())) {
            out.push({ path: full, name: path.basename(e, path.extname(e)), size: st.size })
          }
        } catch { }
      }
    }
    walk(dir)
    return out.slice(0, 2000)
  })

  // 本地音频伴随文件：同名 .lrc 歌词 + 同名/常见封面图
  ipcMain.handle('local:meta', async (_e, filePath: string) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return { lyric: '', cover: '' }
      const dir = path.dirname(filePath)
      const base = path.basename(filePath, path.extname(filePath))

      let lyric = ''
      for (const name of [`${base}.lrc`, `${base}.LRC`, `${base}.Lrc`]) {
        const p = path.join(dir, name)
        if (!fs.existsSync(p)) continue
        const buf = fs.readFileSync(p)
        const utf8 = buf.toString('utf8')
        // 中文歌词常见 GBK 编码：出现替换字符时尝试 GBK 解码
        if (utf8.includes('\uFFFD')) {
          try { lyric = new TextDecoder('gbk').decode(buf) } catch { lyric = utf8 }
        } else {
          lyric = utf8
        }
        break
      }

      let cover = ''
      const imgs = [
        `${base}.jpg`, `${base}.jpeg`, `${base}.png`, `${base}.webp`,
        'cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.png',
        'front.jpg', 'album.jpg'
      ]
      for (const name of imgs) {
        const p = path.join(dir, name)
        if (!fs.existsSync(p)) continue
        const st = fs.statSync(p)
        if (st.size > 3 * 1024 * 1024) break
        const ext = path.extname(p).slice(1).toLowerCase()
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
        cover = `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`
        break
      }
      return { lyric, cover }
    } catch (e: any) {
      console.warn('[local:meta] 读取伴随文件失败:', e?.message || e)
      return { lyric: '', cover: '' }
    }
  })

  // 直接打开本地音频文件（支持多选）
  ipcMain.handle('local:open', async () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
    const res = await dialog.showOpenDialog(win as BrowserWindow, {
      title: '选择本地音频文件',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '音频', extensions: ['mp3', 'flac', 'wav', 'm4a', 'ape', 'ogg', 'aac', 'opus'] }]
    })
    if (res.canceled) return []
    return res.filePaths.map((p) => ({ path: p, name: path.basename(p, path.extname(p)), size: 0 }))
  })

  // 有声书全量聚合（分页遍历 + 限频保护 + 聚合分类 + 磁盘缓存）
  ipcMain.handle('dj:fetch-all', async (_e) => {
    try {
      const mod = await import('./api-dj')
      return await mod.fetchAudiobookAll((msg, n) => {
        mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.send('dj:progress', { msg, n })
      })
    } catch (e: any) {
      console.error('[dj:fetch-all] 失败:', e?.message || e)
      return { error: e?.message || String(e), categories: [], byCategory: {}, audiobook: [], totalRadios: 0, hotPrograms: [] }
    }
  })

  // ===== 本地语音转文本（sherpa-onnx + SenseVoice，离线）=====
  try {
    registerAsrIpc(() => mainWindow)
  } catch (e: any) {
    console.warn('[asr] IPC 注册失败:', e?.message || e)
  }

  // ===== 在线收音机（Radio Browser，免费无需 API key）=====
  ipcMain.handle('radio:stations', async (_e, q: any) => {
    try {
      const mod = await import('./api-radio')
      return await mod.fetchStations(q || {})
    } catch (e: any) {
      console.error('[radio:stations] 失败:', e?.message || e)
      return { error: e?.message || String(e) }
    }
  })
  ipcMain.handle('radio:facets', async (_e, kind: 'countries' | 'tags') => {
    try {
      const mod = await import('./api-radio')
      return await mod.fetchFacets(kind === 'tags' ? 'tags' : 'countries')
    } catch { return [] }
  })
  ipcMain.handle('radio:click', async (_e, uuid: string) => {
    try { const mod = await import('./api-radio'); await mod.registerClick(uuid) } catch { /* 静默 */ }
  })
  // 探测电台地址类型（HLS / 直连音频 / 失效），用于选择正确的播放方式
  ipcMain.handle('radio:probe', async (_e, url: string) => {
    try { return await probeStream(url) } catch (e: any) { return { kind: 'dead', url, error: e?.message || String(e) } }
  })
  // 生成 HLS 本地代理地址（改写播放列表 + 分片，绕过 CORS）
  ipcMain.handle('radio:hls-url', async (_e, url: string) => hlsProxyUrl(url))

  // ===== 下载功能 =====
  // 选择下载目录
  ipcMain.handle('download:select-dir', async () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
    const res = await dialog.showOpenDialog(win as BrowserWindow, {
      title: '选择下载目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths.length) return ''
    setCustomization({ downloadDir: res.filePaths[0] })
    return res.filePaths[0]
  })
  // 下载歌曲：128k/320k 直接保存 MP3；无损 FLAC 保留原格式，
  // 开启「自动转 MP3」后用 ffmpeg 转码并删除原 FLAC
  ipcMain.handle('download:song', async (_e, { url, name, artist, type }: { url: string; name: string; artist: string; type: string }) => {
    if (!url || !/^https?:\/\//i.test(url)) return { file: '', error: '无效音源' }
    try {
      const cust = getStore().customization
      const dir = cust.downloadDir || path.join(app.getPath('downloads'), 'yiyunmusic')
      fs.mkdirSync(dir, { recursive: true })
      const safe = `${name || 'song'} - ${artist || 'unknown'}`.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)
      const ext = type === 'flac' ? '.flac' : type === 'm4a' ? '.m4a' : '.mp3'
      const file = path.join(dir, `${safe}${ext}`)
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 180000)
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'Referer': 'https://music.163.com', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 4096) throw new Error('音源内容异常')
      fs.writeFileSync(file, buf)

      // FLAC 自动转 MP3（320kbps，转换成功后删除原文件）
      if (type === 'flac' && cust.flacToMp3) {
        const mp3 = path.join(dir, `${safe}.mp3`)
        const ok = await convertFlacToMp3(file, mp3)
        if (ok) {
          fs.unlinkSync(file)
          const out = fs.statSync(mp3)
          return { file: mp3, size: out.size, dir, converted: true }
        }
        return { file, size: buf.length, dir, converted: false, warn: 'FLAC 转 MP3 失败，已保留原格式' }
      }
      return { file, size: buf.length, dir }
    } catch (e: any) {
      console.error('[download] 失败:', e?.message || e)
      return { file: '', error: e?.message || String(e) }
    }
  })

  // 本地状态
  ipcMain.handle('store:get', () => {
    const s = getStore()
    return {
      profile: s.profile,
      volume: s.volume,
      playHistory: s.playHistory,
      isLoggedIn: !!s.cookie,
      theme: s.theme,
      quality: s.quality,
      desktopLyrics: s.desktopLyrics,
      customization: s.customization
    }
  })
  ipcMain.handle('store:volume', (_e, v) => setVolume(v))
  ipcMain.handle('store:cookie', () => getCookie())
  ipcMain.handle('store:setcookie', (_e, c) => setCookie(c))
  ipcMain.handle('store:theme', (_e, t: ThemeName) => {
    setTheme(t)
    // 同步主题到桌面歌词窗（独立窗口不共享渲染层状态）
    if (lyricsWindow && !lyricsWindow.isDestroyed()) {
      lyricsWindow.webContents.send('lyrics:theme', t)
    }
    return true
  })
  ipcMain.handle('store:quality', (_e, q: string) => setQuality(q))

  // 桌面歌词控制
  ipcMain.handle('lyrics:open', () => {
    syncLyricsEnabled(true)
    createLyricsWindow()
    return true
  })
  ipcMain.handle('lyrics:close', () => {
    closeLyricsWindow()
    syncLyricsEnabled(false)
    return true
  })
  ipcMain.handle('lyrics:settings', (_e, patch) => {
    const next = setDesktopLyrics(patch)
    if (lyricsWindow && !lyricsWindow.isDestroyed()) {
      if (typeof patch.opacity === 'number') lyricsWindow.setOpacity(patch.opacity)
      if (typeof patch.locked === 'boolean') applyLyricsLock(patch.locked)
      lyricsWindow.webContents.send('lyrics:settings', next)
    }
    updateTrayMenu()
    return next
  })
  ipcMain.handle('lyrics:getsettings', () => ({ ...getStore().desktopLyrics, theme: getStore().theme }))
  ipcMain.handle('lyrics:lock', (_e, locked: boolean) => {
    setLyricsLocked(locked)
    return locked
  })
  // 渲染进程推送歌词数据（记录最新 + 广播）
  ipcMain.on('lyrics:push', (_e, payload) => {
    lastLyricsPayload = payload
    broadcastLyrics(payload)
  })
  // 歌词窗内部请求当前数据（刚打开时同步一次）
  ipcMain.handle('lyrics:request', () => {
    if (lyricsWindow && !lyricsWindow.isDestroyed() && lastLyricsPayload) {
      lyricsWindow.webContents.send('lyrics:update', lastLyricsPayload)
    }
    return lastLyricsPayload
  })
  // 歌词窗拖动/关闭按钮
  ipcMain.on('lyrics:minimize-size', () => {
    if (lyricsWindow && !lyricsWindow.isDestroyed()) lyricsWindow.setSize(360, 90)
  })
  // JS 拖动（绕开 CSS app-region 在 transform 元素上失效的问题）
  ipcMain.on('lyrics:move-start', () => startLyricsDrag())
  ipcMain.on('lyrics:move-end', () => endLyricsDrag())
  // 窗口尺寸调整（宽度 +/-，等比算高度）
  ipcMain.on('lyrics:resize', (_e, dw: number) => resizeLyricsWindow(dw))
  // 预设尺寸（单行 / 两行 / 三行 …）
  ipcMain.on('lyrics:set-size', (_e, w: number, h: number) => setLyricsWindowSize(w, h))
  ipcMain.on('lyrics:win-close', () => {
    closeLyricsWindow()
    syncLyricsEnabled(false)
  })
  ipcMain.on('lyrics:win-hide', () => lyricsWindow?.hide())

  // 窗口控制
  ipcMain.on('win:minimize', () => mainWindow?.minimize())
  ipcMain.on('win:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on('win:close', () => mainWindow?.close())
  // 免责声明「不同意」时真正退出（跳过隐藏到托盘的逻辑）
  ipcMain.on('app:quit', () => { quitting = true; app.quit() })
  ipcMain.on('win:set-fullscreen', (_e, on: boolean) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.setFullScreen(!!on)
  })
  ipcMain.handle('win:ismax', () => !!mainWindow?.isMaximized())
}

app.whenReady().then(() => {
  initStore()
  startAudioProxy()
  // 关键：为网易云音乐 CDN 请求加上 Referer，否则音频/图片可能被拒绝
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const u = details.url
    if (u.includes('music.126.net') || u.includes('music.163.com') || u.includes('126.net')) {
      details.requestHeaders['Referer'] = 'https://music.163.com'
    }
    callback({ requestHeaders: details.requestHeaders })
  })

  setupIpc()
  createWindow()
  createTray()

  // 安装时用户选择了下载语音模型 → 首次启动自动从镜像下载（多镜像 + 断点续传）
  try {
    const asr = require('./asr')
    const wanted = asr.consumeModelWanted()
    if (wanted && !asr.modelStatus().ready) {
      setTimeout(() => {
        asr.downloadModel(mainWindow, wanted).then((r: any) => {
          if (r?.ok) mainWindow?.webContents.send('asr:progress', { modelId: r.modelId, phase: 'done', pct: 1 })
        }).catch(() => {})
      }, 3000) // 延后 3 秒，避免与启动争抢资源
    }
  } catch { /* ASR 不可用不影响启动 */ }

  // 全局快捷键：按用户配置注册（播放控制 + 桌面歌词锁定）
  registerGlobalShortcuts()

  // 恢复上次的窗口最大化状态
  if (getStore().windowBounds?.maximized) {
    setTimeout(() => mainWindow?.maximize(), 300)
  }

  // 若上次开启了桌面歌词，一并恢复
  if (getStore().desktopLyrics.enabled) {
    setTimeout(() => createLyricsWindow(), 800)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => { quitting = true })

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopAudioProxy()
})

app.on('window-all-closed', () => {
  // 有托盘常驻：全部窗口关闭不退出，可从托盘恢复或退出
})

