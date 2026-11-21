import React, { useEffect, useRef, useState } from 'react'
import { IconMusic, IconClose, IconVip, IconUser } from './Icons'
import { useApp } from '../store'

type Step = 'init' | 'loading' | 'ready' | 'expired' | 'success' | 'error'

export default function LoginModal() {
  const { setProfile, loginOpen } = useApp()
  const [open, setOpen] = useState(true)
  const [step, setStep] = useState<Step>('loading')
  const [qrimg, setQrimg] = useState('')
  const [tip, setTip] = useState('正在准备二维码…')
  const keyRef = useRef('')
  const pollRef = useRef<any>(null)
  const aliveRef = useRef(true)

  const startLogin = async () => {
    aliveRef.current = true
    setStep('loading')
    setTip('正在获取登录二维码…')
    try {
      const { key } = await window.eApi.qrKey()
      if (!key) throw new Error('未获取到登录 key')
      keyRef.current = key

      const res = await window.eApi.qrCreate(key)
      const img = typeof res?.qrimg === 'string' ? res.qrimg : res?.data?.qrimg
      if (img) setQrimg(img.startsWith('data:') ? img : `data:image/png;base64,${img}`)
      setStep('ready')
      setTip('请使用网易云音乐 App 扫码登录')

      // 停止旧轮询
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        if (!aliveRef.current) return
        try {
          const r = await window.eApi.qrCheck(keyRef.current)
          const code = r?.code
          if (code === 801) {
            setTip('等待扫码…')
          } else if (code === 802) {
            setTip('已扫码，请在手机上确认登录')
          } else if (code === 803) {
            if (pollRef.current) clearInterval(pollRef.current)
            setTip('登录成功，正在进入…')
            setStep('success')
            const profile = await window.eApi.profile()
            setTimeout(() => {
              if (profile) setProfile(profile)
              setOpen(false)
            }, 700)
          } else if (code === 800) {
            if (pollRef.current) clearInterval(pollRef.current)
            setStep('expired')
            setTip('二维码已过期，请点击刷新')
          }
        } catch {
          // 网络抖动，忽略本次轮询错误
        }
      }, 1500)
    } catch (e: any) {
      console.error('二维码登录初始化失败', e)
      setStep('error')
      setTip(e?.message || '二维码获取失败，请检查网络后重试')
    }
  }

  useEffect(() => {
    if (loginOpen) {
      setOpen(true)
      startLogin()
    }
    return () => {
      aliveRef.current = false
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [loginOpen])

  if (!open) return null

  return (
    <div className="login-overlay">
      <div className="login-card">
        <button className="login-close" onClick={() => setOpen(false)} title="稍后登录">
          <IconClose size={18} />
        </button>

        <div className="login-head">
          <div className="login-logo"><IconMusic size={26} /></div>
          <h2>扫码登录</h2>
          <p>用网易云音乐 App 扫码，即可同步你的歌单与会员权益</p>
        </div>

        <div className="qr-wrap">
          {step === 'loading' && (
            <div className="qr-loading">
              <div className="spinner" />
              <span>正在生成二维码…</span>
            </div>
          )}

          {(step === 'ready' || step === 'success') && qrimg && (
            <div className={`qr-code ${step === 'success' ? 'qr-success' : ''}`}>
              <img src={qrimg} alt="登录二维码" />
              {step === 'success' && (
                <div className="qr-success-mask">
                  <div className="success-check">✓</div>
                  <span>登录成功</span>
                </div>
              )}
            </div>
          )}

          {(step === 'expired' || step === 'error') && (
            <div className="qr-expired">
              <div className="expired-icon">⟳</div>
              <span>{step === 'expired' ? '二维码已过期' : '获取失败'}</span>
              <button onClick={startLogin}>点击刷新</button>
            </div>
          )}
        </div>

        <div className="login-tip">{tip}</div>

        <div className="login-features">
          <div><IconUser size={15} /> 同步个人歌单与收藏</div>
          <div><IconVip size={15} /> 会员账号可完整播放会员歌曲</div>
        </div>

        <div className="login-foot">
          扫码即表示你同意本客户端作为第三方工具访问你的网易云账号数据
        </div>
      </div>
    </div>
  )
}
