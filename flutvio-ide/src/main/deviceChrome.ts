/**
 * src/main/deviceChrome.ts
 * The real device frame Xcode's Simulator draws, read from DeviceKit:
 *
 *   device type profile.plist → chromeIdentifier (e.g. phone11)
 *   /Library/Developer/DeviceKit/Chrome/<id>.devicechrome/Contents/Resources/
 *      chrome.json  — 9-slice part names, bezel sizing, corner radius, buttons (+ HID usage)
 *      *.pdf        — the artwork (rasterised here once with `sips`, cached in userData)
 */

import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DeviceChrome, SimButton } from '../shared/flutvio-api'

const CHROME_DIR = '/Library/Developer/DeviceKit/Chrome'
const PROFILE_DIRS = ['/Library/Developer/CoreSimulator/Profiles/DeviceTypes']
const SCALE = 3

interface ChromeJson {
  identifier: string
  images: {
    topLeft: string
    top: string
    topRight: string
    right: string
    bottomRight: string
    bottom: string
    bottomLeft: string
    left: string
    sizing: { leftWidth: number; rightWidth: number; topHeight: number; bottomHeight: number }
  }
  paths?: { simpleOutsideBorder?: { cornerRadiusX?: number } }
  inputs?: Array<{
    name: string
    accessibilityTitle?: string
    type: string
    usagePage: number
    usage: number
    image: string
    imageDown?: string
    anchor: 'left' | 'right' | 'top' | 'bottom'
    offsets: { normal: { x: number; y: number }; rollover?: { x: number; y: number } }
  }>
}

function sh(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 }, (err, out, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve(out),
    ),
  )
}

/** HID usage (page, usage) → idb button name. */
function buttonFor(page: number, usage: number): SimButton | null {
  if (page === 12 && usage === 233) return 'VOLUME_UP'
  if (page === 12 && usage === 234) return 'VOLUME_DOWN'
  if (page === 12 && usage === 48) return 'LOCK'
  if (page === 12 && usage === 64) return 'HOME'
  if (page === 11 && usage === 45) return 'SIRI' // action button: closest idb equivalent
  return null
}

async function pdfSize(pdf: string): Promise<{ w: number; h: number }> {
  const out = await sh('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', pdf])
  const w = Number(/pixelWidth: ([\d.]+)/.exec(out)?.[1] ?? 0)
  const h = Number(/pixelHeight: ([\d.]+)/.exec(out)?.[1] ?? 0)
  return { w, h }
}

/** Rasterises one PDF at SCALE× (cached) and returns a data URL plus its size in points. */
async function raster(dir: string, cache: string, name: string): Promise<{ url: string; w: number; h: number }> {
  const pdf = join(dir, `${name}.pdf`)
  const { w, h } = await pdfSize(pdf)
  const png = join(cache, `${name}@${SCALE}x.png`)
  if (!existsSync(png)) {
    await sh('sips', ['-s', 'format', 'png', '-z', String(Math.max(1, Math.round(h * SCALE))), String(Math.max(1, Math.round(w * SCALE))), pdf, '--out', png])
  }
  return { url: `data:image/png;base64,${readFileSync(png).toString('base64')}`, w, h }
}

const memo = new Map<string, Promise<DeviceChrome | null>>()

/** Chrome for a device type identifier (e.g. com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro). */
export function deviceChrome(deviceType: string, deviceName: string): Promise<DeviceChrome | null> {
  const key = deviceType || deviceName
  if (!memo.has(key)) memo.set(key, load(deviceType, deviceName).catch(() => null))
  return memo.get(key)!
}

async function load(deviceType: string, deviceName: string): Promise<DeviceChrome | null> {
  // 1) device type → profile.plist → chromeIdentifier
  const typeName = deviceName.replace(/[\\/:]/g, '')
  let profile = ''
  for (const d of PROFILE_DIRS) {
    const p = join(d, `${typeName}.simdevicetype`, 'Contents/Resources/profile.plist')
    if (existsSync(p)) profile = p
  }
  if (!profile) {
    // Fall back to the type identifier's last part (iPhone-17-Pro → "iPhone 17 Pro").
    const guess = deviceType.split('.').pop()?.replace(/-/g, ' ') ?? ''
    const p = join(PROFILE_DIRS[0], `${guess}.simdevicetype`, 'Contents/Resources/profile.plist')
    if (existsSync(p)) profile = p
  }
  if (!profile) return null
  const plist = JSON.parse(await sh('plutil', ['-convert', 'json', '-o', '-', profile])) as { chromeIdentifier?: string }
  const id = plist.chromeIdentifier?.replace('com.apple.dt.devicekit.chrome.', '')
  if (!id) return null

  // 2) chrome.json + artwork
  const dir = join(CHROME_DIR, `${id}.devicechrome`, 'Contents/Resources')
  const json = JSON.parse(readFileSync(join(dir, 'chrome.json'), 'utf8')) as ChromeJson
  const cache = join(app.getPath('userData'), 'chrome', id)
  mkdirSync(cache, { recursive: true })

  const im = json.images
  const [topLeft, top, topRight, right, bottomRight, bottom, bottomLeft, left] = await Promise.all(
    [im.topLeft, im.top, im.topRight, im.right, im.bottomRight, im.bottom, im.bottomLeft, im.left].map((n) => raster(dir, cache, n)),
  )

  const inputs: DeviceChrome['inputs'] = []
  for (const input of json.inputs ?? []) {
    if (input.type !== 'button' || (input.anchor !== 'left' && input.anchor !== 'right')) continue
    const button = buttonFor(input.usagePage, input.usage)
    if (!button) continue
    const img = await raster(dir, cache, input.image)
    const down = input.imageDown ? await raster(dir, cache, input.imageDown) : img
    inputs.push({
      name: input.name,
      title: input.accessibilityTitle ?? input.name,
      anchor: input.anchor,
      x: input.offsets.normal.x,
      y: input.offsets.normal.y,
      hoverX: input.offsets.rollover?.x ?? input.offsets.normal.x,
      width: img.w,
      height: img.h,
      image: img.url,
      imageDown: down.url,
      button,
    })
  }

  return {
    id,
    bezel: { left: im.sizing.leftWidth, right: im.sizing.rightWidth, top: im.sizing.topHeight, bottom: im.sizing.bottomHeight },
    corner: topLeft.w,
    cornerRadius: json.paths?.simpleOutsideBorder?.cornerRadiusX ?? 60,
    parts: {
      topLeft: topLeft.url,
      top: top.url,
      topRight: topRight.url,
      right: right.url,
      bottomRight: bottomRight.url,
      bottom: bottom.url,
      bottomLeft: bottomLeft.url,
      left: left.url,
    },
    inputs,
  }
}
