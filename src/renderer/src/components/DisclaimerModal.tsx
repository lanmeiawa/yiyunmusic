import React from 'react'
import { IconMusic } from './Icons'
import { useApp } from '../store'

/**
 * 首次启动免责声明：第三方客户端性质、账号使用、接口依赖、版权提示。
 * 用户同意后才进入登录/主界面，不同意则退出应用。
 */
export default function DisclaimerModal() {
  const { disclaimerOpen, acceptDisclaimer, declineDisclaimer } = useApp()

  if (!disclaimerOpen) return null

  return (
    <div className="disclaimer-overlay">
      <div className="disclaimer-card">
        <div className="disclaimer-head">
          <div className="disclaimer-logo"><IconMusic size={26} /></div>
          <h2>开始之前，先了解三件事</h2>
        </div>

        <div className="disclaimer-body">
          <div className="disclaimer-item">
            <span className="disclaimer-num">1</span>
            <p><strong>这是第三方客户端</strong>，不是网易云官方产品。登录、播放、歌单与收藏都使用你自己的网易云账号，会员权益以你账号为准。</p>
          </div>
          <div className="disclaimer-item">
            <span className="disclaimer-num">2</span>
            <p>部分功能依赖网易云<strong>非公开接口</strong>，可能随官方调整而变化，偶尔出现播放失败属正常现象，重试或稍后再试即可。</p>
          </div>
          <div className="disclaimer-item">
            <span className="disclaimer-num">3</span>
            <p>请<strong>尊重音乐版权、支持正版</strong>。本项目仅供个人学习与使用，请勿用于商业用途或大规模分发。</p>
          </div>
        </div>

        <div className="disclaimer-foot">
          <button className="disclaimer-decline" onClick={declineDisclaimer}>不同意并退出</button>
          <button className="disclaimer-accept" onClick={acceptDisclaimer}>同意并继续</button>
        </div>
      </div>
    </div>
  )
}
