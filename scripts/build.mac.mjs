/**
 * macOS 签名 + 公证打包入口
 *
 * 与 qqlink_im_pc 一致：证书与公证账号都用同一套（团队 M7446VU8K4）。
 *
 * 用法：
 *   npm run build:mac:signed                 # arm64 + x64
 *   npm run build:mac:signed -- --arm64      # 只打 arm64
 *
 * 公证凭据来源（优先级从高到低）：
 *   1. 已有的环境变量（CI Secrets：APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID）
 *   2. build/appleNotarize.credentials.mjs（本地开发用，与 qqlink_im_pc 同一文件）
 *   3. 都没有时直接报错退出——避免 electron-builder 只打 warning、静默产出未公证的包
 */
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const isBlank = (key) => {
  const v = process.env[key]
  return v == null || String(v).trim() === ''
}

async function loadLocalCredentials() {
  const file = join(root, 'build/appleNotarize.credentials.mjs')
  if (!existsSync(file)) return {}
  const mod = await import(file)
  return mod.appleNotarizeCredentials || {}
}

const creds = await loadLocalCredentials()

if (creds.APPLE_ID && isBlank('APPLE_ID')) process.env.APPLE_ID = creds.APPLE_ID
if (creds.APPLE_APP_SPECIFIC_PASSWORD) {
  const pwd = creds.APPLE_APP_SPECIFIC_PASSWORD
  if (isBlank('APPLE_APP_SPECIFIC_PASSWORD')) process.env.APPLE_APP_SPECIFIC_PASSWORD = pwd
  // notarytool 也认这个命名，兼容 CI
  if (isBlank('APPLE_ID_PASSWORD')) process.env.APPLE_ID_PASSWORD = pwd
}
if (creds.APPLE_TEAM_ID && isBlank('APPLE_TEAM_ID')) process.env.APPLE_TEAM_ID = creds.APPLE_TEAM_ID

const missing = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'].filter(isBlank)
if (missing.length) {
  console.error(
    `[build:mac] 缺少公证凭据：${missing.join(', ')}\n` +
      '请设置环境变量，或从 qqlink_im_pc 复制 build/appleNotarize.credentials.mjs 到本仓库 build/ 目录。'
  )
  process.exit(1)
}

const args = ['electron-builder', '--mac', ...process.argv.slice(2)]
console.log(`[build:mac] 开始签名 + 公证打包：npx ${args.join(' ')}`)

const child = spawn('npx', args, { cwd: root, stdio: 'inherit', env: process.env })
/**
 * 公证通过后把票据钉（staple）到 dmg / zip 上
 *
 * electron-builder 只会为 .app 自动 staple，安装包本身没有票据时，
 * 用户离线安装会触发联网校验失败。这里补一遍。
 */
async function stapleArtifacts() {
  const { readdir } = await import('node:fs/promises')
  const outDir = join(root, 'release')
  if (!existsSync(outDir)) return
  const files = (await readdir(outDir)).filter((f) => f.endsWith('.dmg') || f.endsWith('.zip'))
  for (const f of files) {
    await new Promise((resolve) => {
      const p = spawn('xcrun', ['stapler', 'staple', join(outDir, f)], { stdio: 'inherit' })
      p.on('exit', () => resolve())
    })
  }
}

child.on('exit', async (code) => {
  if ((code ?? 0) === 0) await stapleArtifacts()
  process.exit(code ?? 0)
})
