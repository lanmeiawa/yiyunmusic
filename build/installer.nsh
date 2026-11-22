; 安装时迁移旧版用户数据：登录态、账号列表、个性化设置、自定义图标与背景
; 目标：$APPDATA\yiyunmusic；来源依次尝试历史版本目录
!macro customInstall
  ; 询问是否下载离线语音转文字模型（约 230MB）
  ; 安装包不再内嵌模型（减小体积、照顾不同网速）；选「是」写入标记，
  ; 应用首次启动检测到标记后自动从多镜像下载（带进度与断点续传）。
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否下载离线语音转文字模型（约 230MB）？$\r$\n$\r$\n是：首次启动时自动下载（多镜像、支持断点续传），开启收音机实时转文字$\r$\n否：跳过，之后可在设置里自行下载（适合网速慢或想节省空间）" \
    /SD IDNO IDYES asr_yes IDNO asr_no
  asr_yes:
    CreateDirectory "$APPDATA\yiyunmusic\asr-models"
    FileOpen $R8 "$APPDATA\yiyunmusic\asr-models\wanted" w
    FileWrite $R8 "paraformer-zh"
    FileClose $R8
    DetailPrint "已标记下载中文语音模型，首次启动时自动下载"
    Goto asr_done
  asr_no:
    DetailPrint "跳过语音模型，可在设置里后续下载"
    Goto asr_done
  asr_done:

  ${IfNot} ${FileExists} "$APPDATA\yiyunmusic\yiyun-store.json"
    StrCpy $R9 ""

    ${If} ${FileExists} "$APPDATA\亦云音乐\yiyun-store.json"
      StrCpy $R9 "$APPDATA\亦云音乐"
    ${ElseIf} ${FileExists} "$APPDATA\yiyun-music\yiyun-store.json"
      StrCpy $R9 "$APPDATA\yiyun-music"
    ${ElseIf} ${FileExists} "$APPDATA\yiyunmusic-old\yiyun-store.json"
      StrCpy $R9 "$APPDATA\yiyunmusic-old"
    ${EndIf}

    ${If} $R9 != ""
      DetailPrint "发现旧版用户数据：$R9"
      CreateDirectory "$APPDATA\yiyunmusic"
      CopyFiles /SILENT "$R9\yiyun-store.json" "$APPDATA\yiyunmusic"
      CopyFiles /SILENT "$R9\app-icon.png" "$APPDATA\yiyunmusic"
      CopyFiles /SILENT "$R9\app-icon.ico" "$APPDATA\yiyunmusic"
      CopyFiles /SILENT "$R9\dj-cache.json" "$APPDATA\yiyunmusic"
      CreateDirectory "$APPDATA\yiyunmusic\backgrounds"
      CopyFiles /SILENT "$R9\backgrounds\*.*" "$APPDATA\yiyunmusic\backgrounds"
      DetailPrint "旧版登录态与个性化设置已同步到新版"
    ${EndIf}
  ${EndIf}
!macroend
