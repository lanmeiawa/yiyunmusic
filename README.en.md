# yiyunmusic · NetEase Cloud Music desktop client

[简体中文](README.md) | English

A third-party NetEase Cloud Music desktop client built with **Electron + React + TypeScript + NeteaseCloudMusicApi**, focused on **live lyrics** and a highly customizable interface.

## Download

Windows and Linux builds are published in the **same release page** — pick the one for your system: [v2.0.3 Release](https://github.com/lanmeiawa/yiyunmusic/releases/tag/v2.0.3).

**Windows 10 / 11 x64**
- **yiyunmusic-Setup-2.0.3.exe** — installer (custom directory, desktop shortcut)
- **yiyunmusic-portable-2.0.3.exe** — portable, no installation required

**Linux x64**
- **yiyunmusic-2.0.3-x86_64.AppImage** — universal (Arch / Ubuntu), `chmod +x` then run
- **yiyunmusic-2.0.3-amd64.deb** — Ubuntu / Debian, `sudo apt install ./yiyunmusic-2.0.3-amd64.deb`
- **yiyunmusic-2.0.3-x64.tar.gz** — portable tarball, extract and run `./yiyunmusic`

## Code signing

Since v1.0.3 the installer, portable build and main executable are signed with a self-signed certificate (`CN=yiyunmusic`). Windows does not trust self-signed roots by default, so the "Unknown publisher" prompt may still appear.

To remove it:

1. Download [yiyunmusic-selfsigned.cer](https://github.com/lanmeiawa/yiyunmusic/releases/download/v2.0.0/yiyunmusic-selfsigned.cer)
2. Double-click → Install Certificate → Local Machine → place it in **Trusted Root Certification Authorities**
3. Run the installer again

> For public distribution, use an OV / EV code signing certificate from a CA. The project reads `CSC_LINK` and `CSC_KEY_PASSWORD`, so no code change is needed.

## Features

- **Live lyrics** — word-by-word highlighting, translations, click to seek, automatic gap handling between lines
- **Desktop lyrics** — separate always-on-top window, multi-line layout, click-through lock, theme aware
- **Themes** — Light / Dark / Mitia, custom background image and accent color
- **Real-time audio quality** — playback and download both read the quality actually returned by the API (Standard / Higher / High / Lossless / Hi-Res) with real bitrate and file size
- **Playlist batch tools** — multi-select, batch download, batch like, add to another playlist, remove from playlist
- **Multi-account** — keep several NetEase accounts and switch without scanning again
- **Multi-language UI** — Simplified Chinese / English, switch instantly in Settings
- **Player** — repeat all / repeat one / shuffle, playback speed, sleep timer, 10-band EQ, music visualizer
- **Custom global shortcuts** — record any combination, covers playback and desktop-lyrics lock
- **Search** — three-level fallback (cloud search → legacy search → suggested keywords) plus local search history
- **Local music** — scan local folders and play without the API

## Tech stack

Electron 33 · React 18 · Vite 5 · TypeScript · NeteaseCloudMusicApi 4.34

## Development

```bash
npm install
npm run dev        # development mode
npm run build      # build main / preload / renderer
npm run dist       # package NSIS installer + portable exe into dist-release/
```

## Disclaimer

This project is for personal learning and research only. Please respect music copyright and support the official service. Do not use it for commercial purposes or large-scale redistribution.
