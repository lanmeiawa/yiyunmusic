/**
 * 桌面歌词窗专用入口。
 * 之前和主界面共用 index.html，导致这个 640×150 的小窗口也要
 * 解析整个应用（含所有页面、可视化、设置页）约 550KB 的脚本。
 * 拆成独立入口后只有歌词组件 + 一份样式。
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import DesktopLyrics from './components/DesktopLyrics'
import './styles/desktop-lyrics.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DesktopLyrics />
  </React.StrictMode>
)
