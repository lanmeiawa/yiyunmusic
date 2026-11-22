import React from 'react'
import { IconMusic } from './Icons'
import { useApp } from '../store'

/**
 * 首次启动使用须知：账号、播放与「尊重版权、支持正版」提示。
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
          <h2>开始之前，简单说三件事</h2>
        </div>

        <div className="disclaimer-body">
          <div className="disclaimer-item">
            <span className="disclaimer-num">1</span>
            <p>这是一个<strong>独立开发</strong>的播放器。登录、播放、歌单与收藏都使用你自己的账号，会员权益以账号为准。</p>
          </div>
          <div className="disclaimer-item">
            <span className="disclaimer-num">2</span>
            <p>播放效果取决于你账号可用的权益和网络状况；偶尔加载慢或失败，重试一下，或换个音质通常就好了。</p>
          </div>
          <div className="disclaimer-item">
            <span className="disclaimer-num">3</span>
            <p><strong>请支持正版</strong>：音乐版权归原作者与平台所有。本项目不提供、不存储、不分发任何音乐文件；喜欢一首歌或一张专辑，在官方平台收听、购买或开通会员就是最好的支持。</p>
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
