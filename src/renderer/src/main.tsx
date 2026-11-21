import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import DesktopLyrics from './components/DesktopLyrics'
import './styles/global.css'
import './styles/desktop-lyrics.css'

const isDesktop = window.location.hash.includes('desktop-lyrics')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isDesktop ? <DesktopLyrics /> : <App />}
  </React.StrictMode>
)
