import React, { useEffect, useState } from 'react'
import { useApp } from '../store'
import { LOCALES } from '../i18n'
import { DEFAULT_SHORTCUTS, type ShortcutMap } from '../types'
import NetImg from './NetImg'
import { IconMusic } from './Icons'
import EqPanel from './EqPanel'
import { ShapePicker } from './Visualizer'
import { EQ_PRESETS } from '../utils/audioGraph'

const WELCOME_COLORS = ['#ff6b8b', '#8b7cf6', '#5aa9ff', '#34c9a3', '#ff9950', '#ffd166', '#2ec4c9']

/** 可自定义的全局快捷键动作 */
const SHORTCUT_ITEMS: { key: keyof ShortcutMap; label: string; desc: string }[] = [
  { key: 'togglePlay', label: '播放 / 暂停', desc: '全局控制音乐播放状态' },
  { key: 'next', label: '下一曲', desc: '切换到播放队列中的下一首' },
  { key: 'prev', label: '上一曲', desc: '切换到播放队列中的上一首' },
  { key: 'volumeUp', label: '音量 +', desc: '提高播放音量' },
  { key: 'volumeDown', label: '音量 −', desc: '降低播放音量' },
  { key: 'lockLyrics', label: '锁定桌面歌词', desc: '锁定后鼠标穿透，防止误触' }
]

/** 把键盘事件转换为 Electron accelerator（如 Control+Alt+P） */
function toAccelerator(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  let key = ''
  if (e.key.startsWith('Arrow')) key = e.key.slice(5)
  else if (e.key === ' ') key = 'Space'
  else if (e.key === 'Escape') key = ''
  else if (e.key.length === 1) key = e.key.toUpperCase()
  else key = e.key
  if (!key || ['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return ''
  return [...parts, key].join('+')
}

/** 显示用：Control → Ctrl，并用空格分隔 */
function prettyAccel(a: string): string {
  return a.replace(/Control/g, 'Ctrl').replace(/Meta/g, 'Win').split('+').join(' + ')
}

function baseName(p?: string): string {
  if (!p) return ''
  const parts = p.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || p
}

const PRESET_COLORS = [
  { name: '蜜桃粉', value: '#ff6b8b' },
  { name: '星空紫', value: '#8b7cf6' },
  { name: '晴空蓝', value: '#5aa9ff' },
  { name: '薄荷绿', value: '#34c9a3' },
  { name: '落日橙', value: '#ff9950' },
  { name: '樱雪白', value: '#f0b8cc' },
  { name: '深海青', value: '#2ec4c9' },
  { name: '琥珀金', value: '#d9a441' }
]

export default function SettingsView() {
  const { customization, setCustomization, chooseBg, bgData, theme, setTheme, setMessage, t, desktopLyrics, updateDesktopLyrics } = useApp()

  // 本地语音模型：多模型列表 + 下载进度
  type AsrModelRow = { id: string; name: string; tag: string; desc: string; approxMB: number; ready: boolean; size: number; active: boolean; downloading?: boolean }
  const [asrStatus, setAsrStatus] = useState<{ ready: boolean; size: number; modelId?: string; name?: string } | null>(null)
  const [asrModels, setAsrModels] = useState<AsrModelRow[]>([])
  const [asrBusyId, setAsrBusyId] = useState('')
  const [asrPct, setAsrPct] = useState(0)
  // 接口线路（内置 + 备用服务）
  const [apiUrl, setApiUrl] = useState(customization.apiBackupUrl || '')
  const [apiHealth, setApiHealth] = useState<any>(null)
  const [apiBusy, setApiBusy] = useState(false)
  const testApi = async () => {
    setApiBusy(true)
    try {
      await setCustomization({ apiBackupUrl: apiUrl.trim() })
      const r = await window.eApi.apiHealth()
      setApiHealth(r)
      const ok = r?.builtin?.ok
      setMessage(ok ? `内置线路正常（${r.builtin.ms}ms）` : '内置线路异常，请看下方提示')
    } catch (e: any) {
      setMessage('线路检测失败：' + (e?.message || '未知错误'))
    } finally {
      setApiBusy(false)
    }
  }

  const refreshAsr = async () => {
    const [list, st] = await Promise.all([
      window.eApi.asrModels().catch(() => []),
      window.eApi.asrStatus().catch(() => null)
    ])
    setAsrModels(Array.isArray(list) ? list : [])
    setAsrStatus(st || { ready: false, size: 0 })
  }
  useEffect(() => {
    refreshAsr()
    return window.eApi.onAsrProgress((p) => {
      if (p.phase === 'done') {
        // 后台下载完成（例如安装后首次启动自动下载）→ 刷新列表
        setAsrBusyId('')
        refreshAsr()
      } else {
        setAsrBusyId((p as any).modelId || '')
        setAsrPct(p.pct)
      }
    })
  }, [])
  const [customColor, setCustomColor] = useState(customization.primary || '#ff6b8b')
  const [appNameDraft, setAppNameDraft] = useState(customization.appName || '')
  const [welcomeColorDraft, setWelcomeColorDraft] = useState(customization.welcomeColor || '#ff6b8b')
  const [recording, setRecording] = useState<keyof ShortcutMap | null>(null)
  const [failedKeys, setFailedKeys] = useState<string[]>([])

  // 应用并刷新快捷键注册状态（返回注册失败项）
  const applyShortcuts = async () => {
    const failed = await window.eApi.shortcutsApply().catch(() => [])
    setFailedKeys(Array.isArray(failed) ? failed : [])
    return failed as string[]
  }

  // 进入设置页时检查哪些组合被系统或其他程序占用
  useEffect(() => {
    applyShortcuts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 录制快捷键：按下新组合即保存（Esc 取消）
  useEffect(() => {
    if (!recording) return
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecording(null); return }
      const accel = toAccelerator(e)
      if (!accel) return
      const hasMod = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey
      if (!hasMod && !/^F([1-9]|1[0-2])$/.test(accel)) {
        setMessage('请至少包含 Ctrl / Alt / Shift 中的一个修饰键')
        return
      }
      const map = { ...DEFAULT_SHORTCUTS, ...(customization.shortcuts || {}) }
      const dup = Object.entries(map).find(([k, v]) => k !== recording && v === accel)
      if (dup) {
        setMessage('该组合已被其他操作占用，请换一个')
        return
      }
      const action = recording
      const next = { ...map, [action]: accel }
      setRecording(null)
      await setCustomization({ shortcuts: next })
      const failed = await window.eApi.shortcutsApply().catch(() => [])
      setFailedKeys(Array.isArray(failed) ? failed : [])
      setMessage(failed?.includes(action) ? '已保存，但该组合被系统或其他程序占用' : '快捷键已更新')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, customization.shortcuts, setCustomization, setMessage])

  const rateOptions = [0.5, 0.75, 1, 1.25, 1.5, 2]
  const timerOptions = [
    { label: '关闭', value: 0 },
    { label: '15 分钟', value: 15 },
    { label: '30 分钟', value: 30 },
    { label: '60 分钟', value: 60 },
    { label: '90 分钟', value: 90 }
  ]

  return (
    <div className="settings-view">
      <div className="settings-header">
        <h1>个性化设置</h1>
        <p>自定义背景、配色、布局与播放偏好，所有修改即时生效并自动保存</p>
      </div>

      {/* ===== 界面语言 ===== */}
      <section className="settings-card">
        <h2>{t('settings.language')}</h2>
        <div className="settings-row wrap">
          {LOCALES.map((l) => (
            <button
              key={l.value}
              className={`settings-chip ${(customization.language || 'zh') === l.value ? 'sel' : ''}`}
              onClick={() => {
                setCustomization({ language: l.value })
                setMessage(l.value === 'zh' ? '已切换为简体中文' : 'Language switched to English')
              }}
            >{l.label}</button>
          ))}
        </div>
        <p className="settings-tip">{t('settings.languageHint')}</p>
      </section>

      {/* ===== 背景图 ===== */}
      <section className="settings-card">
        <h2>自定义背景图片</h2>
        <p className="settings-desc">上传本地图片作为应用壁纸（启用自定义主题）。调节模糊度与遮罩暗度保证文字清晰。</p>
        <div className="settings-bg-preview">
          {bgData ? (
            <NetImg src={bgData} />
          ) : (
            <div className="settings-bg-empty"><IconMusic size={34} /> 未设置背景图</div>
          )}
        </div>
        <label className="settings-switch-row" style={{ borderTop: 'none', marginBottom: 10 }}>
          <span>
            <b>背景应用到所有主题</b>
            <i>开启后明亮/暗夜/米提亚主题也显示你的背景图（关闭则仅自定义主题使用）</i>
          </span>
          <input
            type="checkbox"
            checked={customization.bgAll}
            onChange={(e) => setCustomization({ bgAll: e.target.checked })}
          />
          <span className="settings-switch" />
        </label>
        <div className="settings-row">
          <button className="settings-btn primary" onClick={() => chooseBg()}>选择本地图片</button>
          {bgData && (
            <>
              <button className="settings-btn" onClick={() => setCustomization({ bgPath: '' })}>清除背景</button>
              <button className="settings-btn" onClick={() => setTheme(theme === 'custom' ? 'light' : 'custom')}>
                {theme === 'custom' ? '停用自定义主题' : '启用自定义主题'}
              </button>
            </>
          )}
        </div>
        <div className="settings-slider-row">
          <span className="settings-slider-label">背景模糊度</span>
          <input
            type="range" min={0} max={30} step={1}
            value={customization.blur}
            onChange={(e) => setCustomization({ blur: Number(e.target.value) })}
            style={{ ['--p' as any]: `${(customization.blur / 30) * 100}%` }}
          />
          <span className="settings-slider-value">{customization.blur}px</span>
        </div>
        <div className="settings-slider-row">
          <span className="settings-slider-label">遮罩暗度</span>
          <input
            type="range" min={0} max={0.8} step={0.05}
            value={customization.dim}
            onChange={(e) => setCustomization({ dim: Number(e.target.value) })}
            style={{ ['--p' as any]: `${(customization.dim / 0.8) * 100}%` }}
          />
          <span className="settings-slider-value">{Math.round(customization.dim * 100)}%</span>
        </div>
        <p className="settings-tip">提示：背景图较花哨时建议提高模糊度和遮罩，避免影响歌单文字阅读。</p>
      </section>

      {/* ===== 主题色 ===== */}
      <section className="settings-card">
        <h2>主题色</h2>
        <p className="settings-desc">选择一个主色即刻应用到全界面（按钮、滑块、高亮、阴影），再次点击可取消。</p>
        <div className="settings-colors">
          {PRESET_COLORS.map((c) => (
            <button
              key={c.value}
              title={c.name}
              className={`settings-color ${customization.primary === c.value ? 'sel' : ''}`}
              style={{ background: c.value }}
              onClick={() => setCustomization({ primary: customization.primary === c.value ? '' : c.value })}
            />
          ))}
          <span className="settings-color-custom">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
            />
            <button className="settings-btn" onClick={() => setCustomization({ primary: customColor })}>应用自定义色</button>
          </span>
        </div>
        {customization.primary && (
          <button className="settings-btn ghost" onClick={() => setCustomization({ primary: '' })}>恢复主题默认色</button>
        )}
      </section>

      {/* ===== 应用名称与欢迎语 ===== */}
      <section className="settings-card">
        <h2>应用名称与欢迎语</h2>
        <p className="settings-desc">把播放器改成你喜欢的名字，主页问候语也可以换成你的专属颜色。</p>
        <div className="settings-row">
          <span className="settings-slider-label">应用名称</span>
          <input
            className="pl-new-input"
            style={{ width: 220 }}
            value={appNameDraft}
            maxLength={12}
            placeholder="默认：yiyunmusic"
            onChange={(e) => setAppNameDraft(e.target.value)}
          />
          <button className="settings-btn primary" onClick={() => {
            setCustomization({ appName: appNameDraft.trim() })
            setMessage(appNameDraft.trim() ? `应用名称已改为「${appNameDraft.trim()}」` : '已恢复默认名称')
          }}>保存</button>
        </div>
        <div className="settings-row">
          <span className="settings-slider-label">应用图标</span>
          <span className={`settings-icon-preview ${customization.iconPath ? 'has' : ''}`}>
            {customization.iconPath
              ? <img src={`file:///${customization.iconPath.replace(/\\/g, '/')}`} alt="" />
              : <IconMusic size={18} />}
          </span>
          <button className="settings-btn primary" onClick={async () => {
            const p2 = await window.eApi.customIconSelect()
            if (p2) {
              // 主进程已写入磁盘，这里同步渲染层让标题栏立即换图
              await setCustomization({ iconPath: p2 })
              setMessage('图标已更换：标题栏与托盘即时生效，任务栏图标重启应用后更新')
            }
          }}>选择图片…</button>
          <button className="settings-btn" onClick={async () => {
            await setCustomization({ iconPath: '' })
            setMessage('已恢复默认图标')
          }}>恢复默认</button>
        </div>
        <p className="settings-tip">建议使用 256×256 以上的正方形 PNG 或 ICO，透明背景效果更好；更换后标题栏与托盘立即生效。</p>
        <div className="settings-row wrap">
          <span className="settings-slider-label">欢迎语颜色</span>
          {WELCOME_COLORS.map((c) => (
            <button
              key={c}
              className={`settings-color ${customization.welcomeColor === c ? 'sel' : ''}`}
              style={{ background: c }}
              onClick={() => setCustomization({ welcomeColor: customization.welcomeColor === c ? '' : c })}
            />
          ))}
          <span className="settings-color-custom">
            <input
              type="color"
              value={welcomeColorDraft}
              onChange={(e) => setWelcomeColorDraft(e.target.value)}
            />
            <button className="settings-btn" onClick={() => setCustomization({ welcomeColor: welcomeColorDraft })}>应用</button>
          </span>
        </div>
      </section>

      {/* ===== 布局 ===== */}
      <section className="settings-card">
        <h2>界面布局</h2>
        <p className="settings-desc">三种整体布局，切换后整个界面立即生效。</p>
        <div className="settings-row wrap">
          {[
            { v: 'classic', l: '经典', d: '左栏 + 主区 + 底栏' },
            { v: 'immersive', l: '沉浸', d: '大封面 + 弱边框 + 更宽内容区' },
            { v: 'magazine', l: '杂志', d: '双栏卡片流 + 大图封面' }
          ].map((x) => (
            <button
              key={x.v}
              className={`settings-chip ${customization.layout === x.v ? 'sel' : ''}`}
              onClick={() => setCustomization({ layout: x.v as any })}
              title={x.d}
            >{x.l}</button>
          ))}
        </div>
        <label className="settings-switch-row">
          <span>
            <b>显示歌词翻译</b>
            <i>歌词页与桌面歌词中同步显示翻译行</i>
          </span>
          <input
            type="checkbox"
            checked={customization.showTranslation}
            onChange={(e) => setCustomization({ showTranslation: e.target.checked })}
          />
          <span className="settings-switch" />
        </label>
      </section>

      {/* ===== 收音机语音转文字模型 ===== */}
      <section className="settings-card">
        <h2>{t('settings.radioModel')}</h2>
        <p className="settings-desc">
          离线语音识别，全程本地运行、不联网、不上传音频。可以同时安装多个模型随时切换：
          中文内容优先选「中文专用」，需要标点和中英混说选「通用多语种」，低配电脑选「轻量快速」。
        </p>
        <div className="asr-models">
          {asrModels.map((m) => {
            const busy = asrBusyId === m.id || !!m.downloading
            const anyBusy = !!asrBusyId || asrModels.some((x) => x.downloading)
            return (
              <div key={m.id} className={`asr-model ${m.active ? 'active' : ''} ${busy ? 'busy' : ''}`}>
                <div className="asr-model-head">
                  <b>{m.name}</b>
                  <span className="asr-model-tag">{m.tag}</span>
                  {m.active && <span className="asr-model-flag">使用中</span>}
                  <span className="asr-model-size">{m.ready ? (m.size / 1048576).toFixed(0) : m.approxMB} MB</span>
                </div>
                <p className="asr-model-desc">{m.desc}</p>
                <div className="asr-model-actions">
                  {m.ready ? (
                    <>
                      <button
                        className="settings-chip"
                        disabled={m.active || anyBusy}
                        onClick={async () => {
                          const ok = await window.eApi.asrSetModel(m.id).catch(() => false)
                          if (ok) { await refreshAsr(); setMessage(`已切换到「${m.name}」模型`) }
                          else setMessage('切换模型失败')
                        }}
                      >{m.active ? '当前使用' : '使用此模型'}</button>
                      <button
                        className="settings-chip"
                        disabled={anyBusy}
                        onClick={async () => {
                          await window.eApi.asrDelete(m.id).catch(() => false)
                          await refreshAsr()
                          if (m.active) await setCustomization({ radioTranscript: false })
                          setMessage(`已删除「${m.name}」模型`)
                        }}
                      >{t('settings.radioModelDelete')}</button>
                    </>
                  ) : (
                    <button
                      className="settings-chip sel"
                      disabled={anyBusy}
                      onClick={async () => {
                        setAsrBusyId(m.id); setAsrPct(0)
                        setMessage(`正在下载「${m.name}」模型，请勿关闭应用…`)
                        const r = await window.eApi.asrDownload(m.id).catch((e: any) => ({ ok: false, error: e?.message }))
                        setAsrBusyId('')
                        await refreshAsr()
                        if (r?.ok) {
                          const st = await window.eApi.asrStatus().catch(() => null)
                          if (!st?.ready) await setCustomization({ radioTranscript: true })
                          setMessage(`「${m.name}」下载完成，已设为当前模型`)
                        } else {
                          setMessage('模型下载失败：' + (r?.error || '网络异常'))
                        }
                      }}
                    >{busy ? `${t('settings.radioModelDownloading')} ${(asrPct * 100).toFixed(0)}%` : t('settings.radioModelDownload')}</button>
                  )}
                </div>
              </div>
            )
          })}
          {asrModels.length === 0 && <div className="asr-model-empty">正在读取模型列表…</div>}
        </div>
        <label className="settings-switch-row">
          <span>
            <b>{t('radio.transcript')}</b>
            <i>{asrStatus?.ready ? `当前模型：${asrStatus.name || asrStatus.modelId}，收听电台时可实时转文字` : t('radio.transcriptHint')}</i>
          </span>
          <input
            type="checkbox"
            checked={!!customization.radioTranscript && !!asrStatus?.ready}
            disabled={!asrStatus?.ready}
            onChange={(e) => setCustomization({ radioTranscript: e.target.checked })}
          />
          <span className="settings-switch" />
        </label>
      </section>

      {/* ===== 下载 ===== */}
      <section className="settings-card">
        <h2>下载</h2>
        <p className="settings-desc">歌曲行或播放条上的下载按钮可保存歌曲。128k/320k 音源直接保存为 MP3；无损音源（FLAC）保留原格式，文件名格式「歌名 - 歌手」。</p>
        <div className="settings-row">
          <button className="settings-btn primary" onClick={async () => {
            const d = await window.eApi.downloadSelectDir()
            if (d) setMessage('下载目录已设置：' + d)
          }}>选择下载目录</button>
          <span className="settings-dir-label" title={customization.downloadDir || ''}>
            当前：{customization.downloadDir ? baseName(customization.downloadDir) + '（' + customization.downloadDir + '）' : '默认（下载/yiyunmusic）'}
          </span>
        </div>
        <div className="settings-row wrap">
          <span className="settings-slider-label">默认下载音质</span>
          {[
            { v: 'standard', l: '标准 128k' },
            { v: 'higher', l: '较高 192k' },
            { v: 'exhigh', l: '极高 320k' },
            { v: 'lossless', l: '无损 FLAC' },
            { v: 'hires', l: 'Hi-Res' }
          ].map((q) => (
            <button
              key={q.v}
              className={`settings-chip ${customization.downloadQuality === q.v ? 'sel' : ''}`}
              onClick={() => setCustomization({ downloadQuality: q.v })}
            >
              {q.l}
            </button>
          ))}
        </div>
        <label className="settings-switch-row" style={{ borderTop: 'none' }}>
          <span>
            <b>无损自动转 MP3</b>
            <i>下载无损 FLAC 后自动转码为 320kbps MP3 并删除原 FLAC（首次转换可能较慢）</i>
          </span>
          <input
            type="checkbox"
            checked={customization.flacToMp3}
            onChange={(e) => setCustomization({ flacToMp3: e.target.checked })}
          />
          <span className="settings-switch" />
        </label>
        <p className="settings-tip">下载前会通过接口实时查询该歌曲可用的音质并弹窗确认；这里选择的是默认优先档位，不可用时自动落到最高可用档。无损与 Hi-Res 需要对应会员权益，非会员由接口自动降级。</p>
      </section>

      {/* ===== 播放偏好 ===== */}
      <section className="settings-card">
        <h2>播放偏好</h2>
        <div className="settings-row wrap">
          <span className="settings-slider-label">播放倍速</span>
          {rateOptions.map((r) => (
            <button
              key={r}
              className={`settings-chip ${customization.playbackRate === r ? 'sel' : ''}`}
              onClick={() => setCustomization({ playbackRate: r })}
            >
              {r}x
            </button>
          ))}
        </div>
        <div className="settings-row wrap">
          <span className="settings-slider-label">睡眠定时</span>
          {timerOptions.map((t) => (
            <button
              key={t.value}
              className={`settings-chip ${customization.sleepTimerMin === t.value ? 'sel' : ''}`}
              onClick={() => {
                setCustomization({ sleepTimerMin: t.value })
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {customization.sleepTimerMin > 0 && (
          <p className="settings-tip">将在 {customization.sleepTimerMin} 分钟后自动暂停播放。</p>
        )}
      </section>

      {/* ===== 均衡器与可视化 ===== */}
      <section className="settings-card">
        <h2>均衡器与音乐可视化</h2>
        <p className="settings-desc">按需启用特效：关闭后不建立 Web Audio 处理链，播放更省资源。在“动态歌词 → 音乐可视化”中可切换 11 种形状，每个按钮悬停可查看图形说明。</p>
        <label className="settings-switch-row">
          <span>
            <b>音乐可视化</b>
            <i>开启后在歌词页渲染实时频谱动画；关闭时不启动渲染循环（动态歌词照常显示）</i>
          </span>
          <input
            type="checkbox"
            checked={customization.visualizerEnabled !== false}
            onChange={(e) => setCustomization({ visualizerEnabled: e.target.checked })}
          />
          <span className="settings-switch" />
        </label>
        <label className="settings-switch-row">
          <span>
            <b>10 段均衡器</b>
            <i>开启时各频段增益实时生效；关闭时全部旁通为 0dB，保持原始音质</i>
          </span>
          <input
            type="checkbox"
            checked={customization.eqEnabled !== false}
            onChange={(e) => setCustomization({ eqEnabled: e.target.checked })}
          />
          <span className="settings-switch" />
        </label>
        <label className="settings-switch-row">
          <span>
            <b>GPU 硬件加速</b>
            <i>启用 2D Canvas 硬件加速与 GPU 光栅化，可视化更流畅（切换后需重启应用生效）</i>
          </span>
          <input
            type="checkbox"
            checked={customization.gpuAcceleration !== false}
            onChange={(e) => setCustomization({ gpuAcceleration: e.target.checked })}
          />
          <span className="settings-switch" />
        </label>
        <EqPanel />
        <div className="settings-row wrap" style={{ marginTop: 14 }}>
          <span className="settings-slider-label wide">默认可视化形状</span>
          <ShapePicker
            dark={false}
            value={customization.visualShape || 'bars'}
            onChange={(v) => setCustomization({ visualShape: v })}
          />
        </div>
        <div className="settings-slider-row">
          <span className="settings-slider-label wide">可视化灵敏度</span>
          <input
            type="range" min={0.5} max={4} step={0.1}
            value={customization.visualSensitivity || 1.6}
            onChange={(e) => setCustomization({ visualSensitivity: Number(e.target.value) })}
            style={{ ['--p' as any]: `${((customization.visualSensitivity || 1.6) - 0.5) / 3.5 * 100}%` }}
          />
          <span className="settings-slider-value">{(customization.visualSensitivity || 1.6).toFixed(1)}x</span>
        </div>
      </section>

      {/* ===== 桌面歌词样式 ===== */}
      <section className="settings-card">
        <h2>桌面歌词</h2>
        <p className="settings-desc">
          把歌词摆到屏幕上顺手的位置，背景也能彻底透明。也可以直接用鼠标拖动歌词窗口；锁定时鼠标会穿透，不会挡到下面。
        </p>
        <div className="dl-anchor-grid">
          {[
            ['tl', '左上'], ['tc', '上'], ['tr', '右上'],
            ['ml', '左'], ['mc', '居中'], ['mr', '右'],
            ['bl', '左下'], ['bc', '下'], ['br', '右下']
          ].map(([code, label]) => (
            <button
              key={code}
              className={`dl-anchor-cell ${desktopLyrics.anchor === code ? 'sel' : ''}`}
              title={`贴到${label}`}
              onClick={async () => {
                await window.eApi.lyrics.anchor(code)
                await updateDesktopLyrics({})
              }}
            >{label}</button>
          ))}
        </div>
        <div className="settings-row">
          <span className="settings-row-label">对齐</span>
          {[['left', '左对齐'], ['center', '居中'], ['right', '右对齐']].map(([v, l]) => (
            <button
              key={v}
              className={`settings-chip ${(desktopLyrics.align || 'center') === v ? 'sel' : ''}`}
              onClick={() => updateDesktopLyrics({ align: v as any })}
            >{l}</button>
          ))}
        </div>
        <div className="settings-row">
          <span className="settings-row-label">背景</span>
          <input
            type="range"
            className="dl-bg-slider"
            min={0}
            max={100}
            step={5}
            value={Math.round((desktopLyrics.bgOpacity ?? 0.85) * 100)}
            onChange={(e) => updateDesktopLyrics({ bgOpacity: Number(e.target.value) / 100 })}
          />
          <em className="dl-bg-val">{Math.round((desktopLyrics.bgOpacity ?? 0.85) * 100)}%</em>
          <button
            className={`settings-chip ${(desktopLyrics.bgOpacity ?? 0.85) <= 0.02 ? 'sel' : ''}`}
            onClick={() => updateDesktopLyrics({ bgOpacity: 0 })}
          >完全隐藏</button>
        </div>
        <label className="settings-switch-row">
          <span>
            <b>文字描边</b>
            <i>背景透明时压在亮色壁纸上也能看清</i>
          </span>
          <input
            type="checkbox"
            checked={!!desktopLyrics.outline}
            onChange={(e) => updateDesktopLyrics({ outline: e.target.checked })}
          />
          <span className="settings-switch" />
        </label>
      </section>

      {/* ===== 接口线路 ===== */}
      <section className="settings-card">
        <h2>接口线路</h2>
        <p className="settings-desc">
          默认直连网易云，网络不通时会自动切换到其他官方入口。如果内置接口整体失效（比如接口库跟不上官方改动），可以填一个自建的 NeteaseCloudMusicApi 服务地址，内置线路失败时自动改走它。
        </p>
        <div className="settings-row">
          <input
            className="settings-input"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="http://127.0.0.1:3000（留空表示只用内置线路）"
            spellCheck={false}
          />
          <button
            className="settings-btn"
            onClick={async () => {
              await setCustomization({ apiBackupUrl: apiUrl.trim() })
              setApiHealth(null)
              setMessage(apiUrl.trim() ? '备用接口地址已保存' : '已清空备用接口，只使用内置线路')
            }}
          >保存</button>
          <button className="settings-btn" disabled={apiBusy} onClick={testApi}>{apiBusy ? '检测中…' : '测试线路'}</button>
        </div>
        {apiHealth && (
          <div className="settings-tip">
            内置：{apiHealth.builtin?.ok ? `✓ ${apiHealth.builtin.ms}ms${apiHealth.builtin.via && apiHealth.builtin.via !== '默认' ? '（已切到 ' + apiHealth.builtin.via + '）' : ''}` : `✗ ${apiHealth.builtin?.error || '不可用'}`}
            {apiHealth.backup?.url ? `　备用：${apiHealth.backup?.ok ? `✓ ${apiHealth.backup.ms}ms` : `✗ ${apiHealth.backup?.error || '不可用'}`}` : '　备用：未配置'}
          </div>
        )}
        <p className="settings-tip">
          备用地址请只填自己部署的服务：调用时会把登录 Cookie 一并带过去，公共地址不建议使用。
        </p>
      </section>

      {/* ===== 启动与系统 ===== */}
      <section className="settings-card">
        <h2>启动与系统</h2>
        <label className="settings-switch-row">
          <span>
            <b>开机自启</b>
            <i>登录系统后自动启动亦云音乐；也可以随时在系统「启动应用」里关闭</i>
          </span>
          <input
            type="checkbox"
            checked={!!customization.autoLaunch}
            onChange={async (e) => {
              const on = e.target.checked
              await setCustomization({ autoLaunch: on })
              const actual = await window.eApi.appAutoLaunch(on).catch(() => false)
              setMessage(actual === on ? (on ? '已开启开机自启' : '已关闭开机自启') : '系统未接受该设置，请检查系统权限')
            }}
          />
          <span className="settings-switch" />
        </label>
      </section>

      {/* ===== 全局快捷键 ===== */}
      <section className="settings-card">
        <h2>全局快捷键</h2>
        <p className="settings-desc">应用在后台或最小化到托盘时也能控制播放。点击右侧按键框后按下新组合即可修改，Esc 取消；组合需包含 Ctrl / Alt / Shift（F1-F12 可单独使用）。</p>
        <div className="settings-hotkeys">
          {SHORTCUT_ITEMS.map((item) => {
            const accel = (customization.shortcuts || DEFAULT_SHORTCUTS)[item.key]
            const isRec = recording === item.key
            return (
              <div key={item.key} className={`hotkey-row ${isRec ? 'recording' : ''}`}>
                <span className="hotkey-label">
                  <b>{item.label}</b>
                  <i>{item.desc}</i>
                </span>
                <button
                  className={`hotkey-key ${isRec ? 'rec' : ''} ${accel ? '' : 'empty'}`}
                  onClick={() => setRecording(isRec ? null : item.key)}
                  title={isRec ? '按下新的快捷键，Esc 取消' : '点击修改'}
                >
                  {isRec ? '请按下新组合…' : (accel ? prettyAccel(accel) : '未设置')}
                </button>
                {failedKeys.includes(item.key) && !isRec && (
                  <span className="hotkey-warn" title="该组合被系统或其他程序占用，建议换一个">被占用</span>
                )}
                {accel && !isRec && (
                  <button className="hotkey-clear" title="清除该快捷键" onClick={async () => {
                    const map = { ...DEFAULT_SHORTCUTS, ...(customization.shortcuts || {}), [item.key]: '' }
                    await setCustomization({ shortcuts: map })
                    await applyShortcuts()
                    setMessage('已清除该快捷键')
                  }}>✕</button>
                )}
              </div>
            )
          })}
        </div>
        <div className="settings-row" style={{ marginTop: 12 }}>
          <button className="settings-btn" onClick={async () => {
            await setCustomization({ shortcuts: { ...DEFAULT_SHORTCUTS } })
            await applyShortcuts()
            setMessage('快捷键已恢复默认')
          }}>恢复默认快捷键</button>
        </div>
      </section>

      {/* ===== 恢复默认 ===== */}
      <section className="settings-card">
        <h2>恢复默认</h2>
        <p className="settings-desc">重置个性化设置（不影响登录态、歌单与播放记录）。</p>
        <button
          className="settings-btn"
          onClick={() => {
            setCustomization({
              bgPath: '', blur: 12, dim: 0.45, primary: '',
              playbackRate: 1,
              showTranslation: true, sleepTimerMin: 0,
              eqPreset: 'off', eqBands: [...EQ_PRESETS.off],
              visualShape: 'bars', visualSensitivity: 1.6,
              visualizerEnabled: true, eqEnabled: true, gpuAcceleration: true
            })
            if (theme === 'custom') setTheme('light')
          }}
        >
          一键恢复默认
        </button>
      </section>
    </div>
  )
}
