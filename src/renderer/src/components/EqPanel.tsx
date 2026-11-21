import React, { useEffect, useState } from 'react'
import { useApp } from '../store'
import { EQ_FREQS, EQ_LABELS, EQ_PRESETS, EQ_PRESET_LABELS, configureEq, currentEqBands } from '../utils/audioGraph'

/** 10 段图形均衡器：预设一键切换 + 手动推子，拖动时实时生效、松手后持久化 */
export default function EqPanel({ compact = false }: { compact?: boolean }) {
  const { customization, setCustomization } = useApp()
  const bands = customization.eqBands || EQ_PRESETS.off
  const preset = customization.eqPreset || 'off'
  const enabled = customization.eqEnabled !== false
  const [draft, setDraft] = useState<number[]>([...bands])
  const key = bands.join(',')
  useEffect(() => setDraft([...bands]), [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyPreset = (p: string) => {
    const values = [...(EQ_PRESETS[p] || EQ_PRESETS.off)]
    configureEq(values)
    setDraft(values)
    setCustomization({ eqPreset: p, eqBands: values })
  }

  const changeBand = (i: number, value: number) => {
    const next = [...(draft.length === 10 ? draft : currentEqBands())]
    next[i] = value
    setDraft(next)
    configureEq(next)
  }

  const commit = () => {
    if (draft.join(',') === key && preset === 'custom') return
    setCustomization({ eqPreset: 'custom', eqBands: draft })
  }

  return (
    <div className={`eq-panel ${compact ? 'compact' : ''} ${enabled ? '' : 'bypassed'}`}>
      <div className="eq-status">
        <span className={`eq-status-dot ${enabled ? 'on' : ''}`} />
        <span>{enabled ? '均衡器已启用 · 实时生效' : '均衡器已旁通 · 当前为原始音质'}</span>
        {!enabled && (
          <button className="eq-enable" onClick={() => setCustomization({ eqEnabled: true })}>开启均衡器</button>
        )}
      </div>
      <div className="eq-presets">
        {Object.keys(EQ_PRESETS).map((p) => (
          <button
            key={p}
            className={`eq-preset ${preset === p ? 'sel' : ''}`}
            onClick={() => applyPreset(p)}
          >{EQ_PRESET_LABELS[p] || p}</button>
        ))}
      </div>
      <div className="eq-sliders">
        {EQ_FREQS.map((_f, i) => (
          <div className="eq-band" key={_f}>
            <span className="eq-value">{draft[i] > 0 ? '+' : ''}{draft[i]}</span>
            <input
              className="eq-slider"
              type="range" min={-12} max={12} step={1}
              value={draft[i]}
              style={{ ['--fill' as any]: `${((draft[i] + 12) / 24) * 100}%` }}
              onChange={(e) => changeBand(i, Number(e.target.value))}
              onPointerUp={commit}
              onKeyUp={commit}
              onBlur={commit}
              aria-label={`${EQ_LABELS[i]}Hz 增益`}
            />
            <span className="eq-freq">{EQ_LABELS[i]}</span>
          </div>
        ))}
      </div>
      <div className="eq-foot">
        <span>低频 ← 频率 (Hz) → 高频</span>
        <button className="eq-reset" onClick={() => applyPreset('off')}>重置为 0 dB</button>
      </div>
    </div>
  )
}
