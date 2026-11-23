# yiyunmusic · NetEase Cloud Music desktop client

[简体中文](README.md) | English · [Changelog](CHANGELOG.md)

A third-party NetEase Cloud Music desktop client built with **Electron + React + TypeScript + NeteaseCloudMusicApi**, focused on **live lyrics**, desktop lyrics and a 15-shape music visualizer.

## Download

Windows and Linux builds are published in the **same release page** — pick the one for your system: [v2.2.9 Release](https://github.com/lanmeiawa/yiyunmusic/releases/tag/v2.2.9).

**Windows 10 / 11 x64**
- **yiyunmusic-Setup-2.2.9.exe** — installer (custom directory, desktop shortcut)
- **yiyunmusic-portable-2.2.9.exe** — portable, no installation required

**Linux x64**
- **yiyunmusic-2.2.9-x86_64.AppImage** — universal (Arch / Ubuntu), `chmod +x` then run
- **yiyunmusic-2.2.9-amd64.deb** — Ubuntu / Debian, `sudo apt install ./yiyunmusic-2.2.9-amd64.deb`
- **yiyunmusic-2.2.9-x64.tar.gz** — portable tarball, extract and run `./yiyunmusic`

> Since v2.2.9 the login cookie is encrypted at rest instead of being stored as plain text in the config file.

## Code signing

Since v1.0.3 the installer, portable build and main executable are signed with a self-signed certificate (`CN=yiyunmusic`). Windows does not trust self-signed roots by default, so the "Unknown publisher" prompt may still appear.

To remove it:

1. Download [yiyunmusic-selfsigned.cer](https://github.com/lanmeiawa/yiyunmusic/releases/download/v2.0.0/yiyunmusic-selfsigned.cer)
2. Double-click → Install Certificate → Local Machine → place it in **Trusted Root Certification Authorities**
3. Run the installer again

> For public distribution, use an OV / EV code signing certificate from a CA. The project reads `CSC_LINK` and `CSC_KEY_PASSWORD`, so no code change is needed.

## Why this exists

To be fair: the official client already has desktop lyrics, word-by-word lyrics, translations, lyric search and its own visual effects (音波系列 / 琉璃光波 / 神光模式). We are not claiming to invent them.

The difference is scope. The official app is a full music **community** — comments, live rooms, shop, VIP pop-ups. yiyunmusic is a small client built around **listening, reading lyrics and watching the music**: lyrics and visualization are the main stage, the visualizer offers 15 switchable shapes with sensitivity control, and there is no social feed or shopping mall.

## Compared with the official client

> Honest differences only. Features the official app already has are marked as such.

| Feature | Official client | yiyunmusic |
|---|---|---|
| Word-by-word lyrics | Yes, when the song provides word-level timing | Yes; smooth per-line progress when word timing is unavailable |
| Desktop lyrics | Yes, with font / size / color / karaoke highlight / lock | Yes, draggable, frosted glass + blurred cover, auto 1/2/3 lines, click-through lock |
| Lyric translation | Yes | Yes, bilingual sync |
| Lyric search | Yes (switch to the "Lyrics" tab in results) | Yes, search by lyric fragment |
| Music visualization | Yes, built-in player effects (音波系列 / 琉璃光波 / 神光模式) | **15 switchable shapes**: bars / mirror / circle / spiral / cube / sphere / tunnel / mandala / starfield / terrain / kaleido / orbit / wave and more; adjustable sensitivity, 10-band EQ, immersive fullscreen |
| Local lyric / cover detection | Matches online lyrics for local files | Reads same-named `.lrc` (GBK / UTF-8) and cover art from disk, works offline |
| Linux build | Yes (official Linux client, mainly deb) | Yes — AppImage / deb / tar.gz; Windows and Linux share one release page |
| Social / live / short video / shop | Yes | No (by design) |
| Ads / VIP pop-ups | Yes | No |

## Features

- **Live lyrics** — word-by-word highlighting, translations, click to seek, automatic gap handling between lines; jumps straight to the current line when you open, switch songs or come back from another page
- **Desktop lyrics** — separate always-on-top window, multi-line layout, click-through lock, theme aware
- **Themes** — Light / Dark / Mitia, custom background image and accent color
- **Real-time audio quality** — playback and download both read the quality actually returned by the API (Standard / Higher / High / Lossless / Hi-Res) with real bitrate and file size
- **Playlist batch tools** — multi-select, batch download, batch like, add to another playlist, remove from playlist
- **Multi-account** — keep several NetEase accounts and switch without scanning again
- **Music visualizer** — 15 real-time shapes (bars / circle / spiral / cube / sphere / mandala / starfield / terrain / kaleido / orbit / wave…), adjustable sensitivity, 10-band EQ and immersive fullscreen
- **Multi-language UI** — Simplified Chinese / English, switch instantly in Settings
- **Player** — repeat all / repeat one / shuffle, playback speed, sleep timer
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

## Respect Copyright

yiyunmusic is an independently developed music player. You sign in with your own NetEase Cloud Music account, and your playlists, favorites and history stay in sync.

- This project **does not provide, store or distribute** any music files; it plays content available to your own account on the official platform.
- Music, artwork and lyrics belong to their respective owners. If you enjoy something, please **listen, purchase or subscribe on the official platform** — that is the best way to support the creators.
- Rights holders: if anything here seems inappropriate, please open an issue and we will address it promptly.

**License**: MIT — use it, change it, build with it, commercial use included; just keep the copyright notice. See [LICENSE](LICENSE).
