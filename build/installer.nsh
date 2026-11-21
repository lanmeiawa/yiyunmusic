; 安装时迁移旧版用户数据：登录态、账号列表、个性化设置、自定义图标与背景
; 目标：$APPDATA\yiyunmusic；来源依次尝试历史版本目录
!macro customInstall
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
