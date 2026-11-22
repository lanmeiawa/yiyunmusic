离线语音转文字模型目录（SenseVoice int8）。
CI 构建时会自动下载 model.int8.onnx 与 tokens.txt 到此处并打包进安装包。
本地开发可留空；应用会从 hf-mirror 按需下载到 userData。
