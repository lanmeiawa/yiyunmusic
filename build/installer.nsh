; 安装时迁移旧版用户数据：登录态、账号列表、个性化设置、自定义图标与背景
; 目标：$APPDATA\yiyunmusic；来源依次尝试历史版本目录
!macro customInstall
  ; 询问是否安装离线语音转文字模型（约 230MB）
  ; 选「是」：解压安装包内附带的模型到 userData（快，不依赖网速）
  ; 选「否」：不解压，之后可在设置里按需下载
  ${If} ${FileExists} "$INSTDIR\resources\asr-model\model.int8.onnx"
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "是否安装离线语音转文字模型（约 230MB）？$\r$\n$\r$\n是：立即解压，开启收音机实时转文字（推荐，速度快）$\r$\n否：跳过，之后可在设置里自行下载（适合网速慢或想节省空间）" \
      /SD IDNO IDYES asr_install IDNO asr_skip
    asr_install:
      CreateDirectory "$APPDATA\yiyunmusic\asr-model"
      CopyFiles /SILENT "$INSTDIR\resources\asr-model\*.*" "$APPDATA\yiyunmusic\asr-model"
      DetailPrint "离线语音模型已安装"
      Goto asr_done
    asr_skip:
      DetailPrint "跳过语音模型，可在设置里后续下载"
      Goto asr_done
    asr_done:
  ${EndIf}

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
