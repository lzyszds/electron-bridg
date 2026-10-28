#!/usr/bin/env node
/**
 * 应用图标生成脚本（纯 Node 实现，无第三方依赖）
 *
 * 生成 build/ 目录下的：
 *   - icon.png   1024x1024 源图
 *   - icon.ico   Windows 图标（内嵌 16~256 多尺寸 PNG）
 *   - icon.icns  macOS 图标（仅 macOS 上可生成，依赖系统 iconutil）
 *
 * 用法：node scripts/generate-icons.mjs
 * 想换图标：直接用设计稿替换 build/icon.png（1024x1024）后重新执行本脚本即可。
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = join(root, 'build')

/* ---------------------------------- 图形参数 --------------------------------- */

const BG_FROM = [0x3b, 0x82, 0xf6] // 渐变起点：蓝
const BG_TO = [0x7c, 0x3a, 0xed] // 渐变终点：紫
const CORNER = 0.22 // 圆角半径（相对边长）
const RING_R = 0.155 // 圆环半径
const RING_T = 0.036 // 圆环线宽
const GAP = 0.013 // 互扣处的断口宽度
const LEFT_X = 0.395 // 左环圆心
const RIGHT_X = 0.605 // 右环圆心

/**
 * 圆角矩形的有符号距离场：返回值 > 0 表示在图形外部
 */
function sdRoundRect(x, y, halfW, halfH, r) {
  const dx = Math.abs(x) - (halfW - r)
  const dy = Math.abs(y) - (halfH - r)
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r
}

/**
 * 采样单个点的颜色，u/v 为 0~1 的归一化坐标
 * 图案为两个互扣的白色圆环（上半部分右环压左环，下半部分反之），寓意「桥接」
 */
function sampleColor(u, v) {
  if (sdRoundRect(u - 0.5, v - 0.5, 0.5, 0.5, CORNER) > 0) return [0, 0, 0, 0]

  const t = Math.min(1, Math.max(0, u * 0.6 + v * 0.4))
  const bg = [
    BG_FROM[0] + (BG_TO[0] - BG_FROM[0]) * t,
    BG_FROM[1] + (BG_TO[1] - BG_FROM[1]) * t,
    BG_FROM[2] + (BG_TO[2] - BG_FROM[2]) * t
  ]

  const dA = Math.abs(Math.hypot(u - LEFT_X, v - 0.5) - RING_R) - RING_T
  const dB = Math.abs(Math.hypot(u - RIGHT_X, v - 0.5) - RING_R) - RING_T
  const rightOnTop = v < 0.5
  const onRing = rightOnTop
    ? dB < 0 || (dA < 0 && dB > GAP)
    : dA < 0 || (dB < 0 && dA > GAP)

  return onRing ? [255, 255, 255, 255] : [bg[0], bg[1], bg[2], 255]
}

/**
 * 渲染指定尺寸的 RGBA 位图，超采样做抗锯齿
 */
function render(size) {
  const samples = size <= 64 ? 4 : 3
  const step = 1 / (size * samples)
  const out = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const c = sampleColor((x * samples + sx + 0.5) * step, (y * samples + sy + 0.5) * step)
          r += c[0] * c[3]
          g += c[1] * c[3]
          b += c[2] * c[3]
          a += c[3]
        }
      }
      const idx = (y * size + x) * 4
      // 先按 alpha 加权平均颜色，再还原为直通 alpha
      out[idx] = a > 0 ? Math.round(r / a) : 0
      out[idx + 1] = a > 0 ? Math.round(g / a) : 0
      out[idx + 2] = a > 0 ? Math.round(b / a) : 0
      out[idx + 3] = Math.round(a / (samples * samples))
    }
  }
  return out
}

/* ---------------------------------- PNG 编码 --------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 6 // 颜色类型：RGBA
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0 // 过滤器：None
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------------------------------- ICO 编码 --------------------------------- */

function encodeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry[0] = size >= 256 ? 0 : size // 256 用 0 表示
    entry[1] = size >= 256 ? 0 : size
    entry.writeUInt16LE(1, 4) // 色彩平面
    entry.writeUInt16LE(32, 6) // 位深
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

/* ----------------------------------- 主流程 ---------------------------------- */

const SIZES = [16, 32, 48, 64, 128, 256, 512, 1024]
const pngs = new Map()

mkdirSync(buildDir, { recursive: true })

for (const size of SIZES) {
  pngs.set(size, encodePng(size, render(size)))
  process.stdout.write(`\r渲染图标 ${size}x${size} ...`)
}
process.stdout.write('\r')

writeFileSync(join(buildDir, 'icon.png'), pngs.get(1024))
console.log('已生成 build/icon.png (1024x1024)')

writeFileSync(
  join(buildDir, 'icon.ico'),
  encodeIco([16, 32, 48, 64, 128, 256].map((size) => ({ size, png: pngs.get(size) })))
)
console.log('已生成 build/icon.ico')

// icns 依赖 macOS 自带的 iconutil，其他平台跳过（仓库中已提交生成结果）
if (process.platform === 'darwin') {
  const iconsetDir = join(buildDir, 'icon.iconset')
  rmSync(iconsetDir, { recursive: true, force: true })
  mkdirSync(iconsetDir, { recursive: true })

  const iconsetFiles = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024]
  ]
  for (const [name, size] of iconsetFiles) {
    writeFileSync(join(iconsetDir, name), pngs.get(size))
  }

  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', join(buildDir, 'icon.icns')])
  rmSync(iconsetDir, { recursive: true, force: true })
  console.log('已生成 build/icon.icns')
} else if (!existsSync(join(buildDir, 'icon.icns'))) {
  console.warn('跳过 icns 生成：非 macOS 平台，请改用仓库中已提交的 build/icon.icns')
}
