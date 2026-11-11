/**
 * h264.ts — plays an H.264 Annex-B stream on a canvas with WebCodecs (hardware decode).
 *
 * Chunks arrive as complete access units from idb_companion. Decoding starts at the first key
 * frame (SPS+PPS+IDR); only the newest decoded frame is drawn, once per animation frame.
 */

export interface PlayerStats {
  fps: number
  width: number
  height: number
}

export class H264Player {
  private decoder: VideoDecoder | null = null
  private codec = ''
  private waitingForKey = true
  private pending: VideoFrame | null = null
  private raf = 0
  private ts = 0
  private frames = 0
  private fpsWindow = performance.now()
  private fps = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onFrame: (stats: PlayerStats) => void,
    private readonly onError: (message: string) => void,
  ) {}

  static supported(): boolean {
    return typeof VideoDecoder !== 'undefined'
  }

  /** Call when a new stream starts: drop state and wait for the next key frame. */
  reset(): void {
    this.waitingForKey = true
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.reset()
    this.codec = this.decoder?.state === 'configured' ? this.codec : ''
  }

  push(data: Uint8Array): void {
    const { types, sps } = scan(data)
    const key = types.has(5)
    if (sps) {
      const codec = codecFromSps(sps)
      if (codec !== this.codec || !this.decoder || this.decoder.state !== 'configured') this.configure(codec)
    }
    if (!this.decoder || this.decoder.state !== 'configured') return
    if (this.waitingForKey) {
      if (!key) return
      this.waitingForKey = false
    }
    try {
      this.decoder.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: (this.ts += 16_667), data }))
    } catch (err) {
      this.waitingForKey = true
      this.onError((err as Error).message)
    }
  }

  private configure(codec: string): void {
    if (!this.decoder || this.decoder.state === 'closed') {
      this.decoder = new VideoDecoder({
        output: (frame) => this.queue(frame),
        error: (err) => {
          // Recover on the next key frame.
          this.codec = ''
          this.waitingForKey = true
          this.onError(err.message)
        },
      })
    }
    this.decoder.configure({ codec, optimizeForLatency: true, hardwareAcceleration: 'prefer-hardware' })
    this.codec = codec
    this.waitingForKey = true
  }

  private queue(frame: VideoFrame): void {
    this.pending?.close()
    this.pending = frame
    if (!this.raf) this.raf = requestAnimationFrame(() => this.draw())
  }

  private draw(): void {
    this.raf = 0
    const frame = this.pending
    this.pending = null
    if (!frame) return
    const c = this.canvas
    if (c.width !== frame.displayWidth || c.height !== frame.displayHeight) {
      c.width = frame.displayWidth
      c.height = frame.displayHeight
    }
    c.getContext('2d', { alpha: false })?.drawImage(frame, 0, 0)
    frame.close()

    this.frames++
    const now = performance.now()
    if (now - this.fpsWindow >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsWindow))
      this.frames = 0
      this.fpsWindow = now
    }
    this.onFrame({ fps: this.fps, width: c.width, height: c.height })
  }

  close(): void {
    cancelAnimationFrame(this.raf)
    this.pending?.close()
    this.pending = null
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close()
    this.decoder = null
  }
}

/** NAL unit types present in an Annex-B buffer, and the first SPS payload. */
function scan(buf: Uint8Array): { types: Set<number>; sps: Uint8Array | null } {
  const types = new Set<number>()
  let sps: Uint8Array | null = null
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === 0 && buf[i + 1] === 0 && (buf[i + 2] === 1 || (buf[i + 2] === 0 && buf[i + 3] === 1))) {
      const start = buf[i + 2] === 1 ? i + 3 : i + 4
      const type = buf[start] & 0x1f
      types.add(type)
      if (type === 7 && !sps) sps = buf.subarray(start, start + 4)
      i = start
    }
  }
  return { types, sps }
}

/** avc1.PPCCLL from the SPS profile / constraint / level bytes. */
function codecFromSps(sps: Uint8Array): string {
  const hex = (n: number): string => n.toString(16).padStart(2, '0')
  return `avc1.${hex(sps[1])}${hex(sps[2])}${hex(sps[3])}`
}
