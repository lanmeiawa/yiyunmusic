import crypto from 'node:crypto'

/**
 * 本地凭证轻度加密。
 *
 * 目标：避免 yiyun-store.json 里直接出现明文 Cookie（扫码登录凭证），
 * 让随手打开文件或用简单正则/脚本扫目录的人拿不到登录态。
 * 这不承诺对抗专业逆向 —— 桌面端任何内置密钥都能被反编译取出，
 * 真要更强保护需要系统钥匙串（Windows Credential Manager / libsecret），
 * 对一个非官方客户端来说收益有限。
 *
 * 格式：enc:v1:<base64(iv 12B | authTag 16B | ciphertext)>
 * 读取时遇到非 enc: 前缀的旧明文会原样返回，并在下一次保存时自动转为密文，
 * 因此从旧版本升级不会掉登录态。
 */

const PREFIX = 'enc:v1:'

// 应用内置口令。故意拆成两段拼接，避免被全文搜索一把抓到。
const SECRET = 'yiyunmusic' + '::local-vault::2026'
const KEY = crypto.createHash('sha256').update(SECRET).digest() // 32B -> AES-256

export function isSealed(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

/** 明文 -> 密文；空串保持空串；已加密的原样返回（幂等） */
export function seal(value: string): string {
  if (!value) return ''
  if (isSealed(value)) return value
  try {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
    const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return PREFIX + Buffer.concat([iv, tag, body]).toString('base64')
  } catch (e) {
    console.warn('[secure] Cookie 加密失败，保留明文以保证登录可用', e)
    return value
  }
}

/**
 * 密文 -> 明文；旧版明文原样返回（兼容升级）。
 * 解密失败（密钥不匹配/文件损坏）返回空串，让应用按未登录处理，而不是崩溃。
 */
export function unseal(value: string): string {
  if (!value) return ''
  if (!isSealed(value)) return value
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64')
    if (raw.length < 28) return ''
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const body = raw.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  } catch {
    console.warn('[secure] Cookie 解密失败，已按未登录处理')
    return ''
  }
}
