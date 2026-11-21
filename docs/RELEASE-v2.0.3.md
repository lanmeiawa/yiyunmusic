# yiyunmusic v2.0.3 更新说明

> 这次更新，你能感受到什么？—— 三件事，都用大白话讲。

## 1. Windows 和 Linux，放进同一个发布页了

以前 Windows 一个 Release、Linux 另一个 Release，找安装包要来回翻。

从这一版开始，**一个版本号只对应一个发布页**：进去之后，Windows 用户拿 `.exe`，Linux 用户挑 `.AppImage` / `.deb` / `.tar.gz`，不用再分辨哪个才是给自己用的。

## 2. 登录状态检查更稳

有环境反馈在检查登录状态时遇到过 `result is not defined` 这类报错，可能让登录卡住。

这次我们对当前代码做了全量排查和兜底加固：登录状态轮询不再因为单个字段缺失或接口异常而中断。同时，遇到网易云风控提示「请完成验证操作」时，应用会明确告诉你发生了什么，不会只丢一个看不懂的失败。

## 3. 发布说明以后都按「人话」写

从这一版开始，更新日志不再堆技术名词，而是先回答一个问题：**你更新完之后，到底哪里变好了？**

以后每个版本都会照这个格式写，方便你一眼决定要不要升级。

---

**下载**：https://github.com/lanmeiawa/yiyunmusic/releases/tag/v2.0.3

- `yiyunmusic-Setup-2.0.3.exe`（Windows 安装版）
- `yiyunmusic-portable-2.0.3.exe`（Windows 便携版）
- `yiyunmusic-2.0.3-x86_64.AppImage`（Linux 通用版，Arch / Ubuntu 均可）
- `yiyunmusic-2.0.3-amd64.deb`（Ubuntu / Debian）
- `yiyunmusic-2.0.3-x64.tar.gz`（Linux 通用便携版）

> 下一阶段计划：加入 ARM 架构 Windows 包，以及更多架构的 Linux 包。当前 v2.0.3 先提供 x64 版本。
