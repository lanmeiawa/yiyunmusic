// 声明图片资源模块，让 TS 能识别 import 的 *.png（Vite 会在构建时处理为 URL）
declare module '*.png' {
  const src: string
  export default src
}
declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.jpeg' {
  const src: string
  export default src
}
declare module '*.webp' {
  const src: string
  export default src
}
