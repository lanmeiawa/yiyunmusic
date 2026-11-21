// 启动包装器：清除 WorkBuddy 注入的 ELECTRON_RUN_AS_NODE，
// 否则子 Electron 会被当成纯 Node 运行，导致 app 为 undefined。
const { spawn } = require('node:child_process')
const path = require('node:path')

const isDev = process.argv.includes('--dev')
const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

function run() {
  if (isDev) {
    // 开发模式：electron-vite dev 负责构建 + 拉起 electron
    const child = spawn('npx', ['electron-vite', 'dev'], {
      cwd: path.join(__dirname, '..'),
      env,
      stdio: 'inherit',
      shell: true
    })
    child.on('exit', (code) => process.exit(code ?? 0))
  } else {
    // 生产模式：直接以打包产物启动
    const entry = path.join(__dirname, '..', 'out', 'main', 'index.js')
    const child = spawn(electronBin, [entry], {
      cwd: path.join(__dirname, '..'),
      env,
      stdio: 'inherit'
    })
    child.on('exit', (code) => process.exit(code ?? 0))
  }
}

run()
