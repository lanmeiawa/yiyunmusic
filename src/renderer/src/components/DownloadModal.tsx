import React, { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store'
import type { QualityProbe } from '../types'
import { levelLabel, probeLabel, formatSize, uniqueProbes } from '../utils/quality'
import { IconDownload } from './Icons'

/**
 * 下载音质选择弹窗：
 * 打开时已通过接口实时探测该歌曲可用音质，这里只做展示与确认。
 */
export default function DownloadModal() {
  const { downloadDialog, closeDownload, confirmDownload, customization, t } = useApp()
  const [selected, setSelected] = useState<QualityProbe | null>(null)

  const options = useMemo(() => uniqueProbes(downloadDialog?.probes || []), [downloadDialog?.probes])

  useEffect(() => {
    if (!downloadDialog || downloadDialog.loading) return
    const pref = customization.downloadQuality || 'exhigh'
    // 优先选中用户偏好的档位；不可用时退回最高可用档
    const hit = options.find((o) => o.level === pref)
    setSelected(hit || options[options.length - 1] || null)
  }, [downloadDialog, options, customization.downloadQuality])

  if (!downloadDialog) return null
  const { track, loading, error, downloading } = downloadDialog

  return (
    <div className="login-overlay" onClick={closeDownload}>
      <div className="dl-modal" onClick={(e) => e.stopPropagation()}>
        <button className="login-close" onClick={closeDownload} title="关闭">✕</button>

        <div className="dl-modal-head">
          <div className="dl-modal-icon"><IconDownload size={20} /></div>
          <div className="dl-modal-title">
            <h3>{t('download.title', { name: track.name })}</h3>
            <p>{track.artists.map((a) => a.name).join(' / ') || '未知歌手'}</p>
          </div>
        </div>

        {loading ? (
          <div className="dl-modal-loading">
            <span className="dl-spinner" />
            {t('download.fetching')}
          </div>
        ) : options.length === 0 ? (
          <div className="dl-modal-empty">{error || t('download.noSource')}</div>
        ) : (
          <div className="dl-modal-list">
            {options.map((p) => {
              const downgraded = p.actualLevel && p.actualLevel !== p.level
              return (
                <button
                  key={`${p.level}-${p.actualLevel}`}
                  className={`dl-quality ${selected === p ? 'sel' : ''}`}
                  onClick={() => setSelected(p)}
                >
                  <span className="dl-quality-radio" />
                  <span className="dl-quality-main">
                    <b>{levelLabel(p.level)}</b>
                    <em>{probeLabel(p)}</em>
                  </span>
                  {downgraded && <span className="dl-tag warn">已降级</span>}
                  {p.trial && <span className="dl-tag warn">试听</span>}
                  {p.fee === 1 && <span className="dl-tag vip">VIP</span>}
                  <span className="dl-quality-size">{formatSize(p.size) || '—'}</span>
                </button>
              )
            })}
          </div>
        )}

        {error && options.length > 0 && <p className="dl-modal-error">{error}</p>}
        <p className="dl-modal-tip">
          {t('download.tip')}
        </p>

        <div className="dl-modal-foot">
          <span>保存到：{customization.downloadDir || '下载 / yiyunmusic'}</span>
          <div>
            <button className="settings-btn" onClick={closeDownload}>{t('download.cancel')}</button>
            <button
              className="settings-btn primary"
              disabled={!selected || loading || !!downloading}
              onClick={() => selected && confirmDownload(selected)}
            >{downloading ? t('download.preparing') : t('download.start')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
