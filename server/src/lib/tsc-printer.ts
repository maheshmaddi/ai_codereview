/**
 * TSC TE244 Direct Printer Integration
 *
 * Communicates with the TSC TE244 thermal label printer using TSPL2 commands.
 * NO third-party packages — uses only Node.js built-ins (fs, net, child_process).
 *
 * Supported connections:
 *   • USB  — writes directly to /dev/usb/lp0 (Linux/Android)
 *   • TCP  — connects via raw socket on port 9100 (Ethernet adapter)
 *
 * Android (USB OTG) notes:
 *   If running under Termux with root: chmod 666 /dev/usb/lp0
 *   If running as an Android Service with UsbManager, pass the fd path to devicePath.
 */

import fs from 'fs'
import net from 'net'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// ─── Types ─────────────────────────────────────────────────────────────────

export type BarcodeType =
  | '128'  // Code 128 (recommended, compact, alphanumeric)
  | '39'   // Code 39
  | 'EAN13'
  | 'EAN8'
  | 'UPCA'
  | 'UPCE'
  | 'ITF'
  | 'MSI'
  | 'CODABAR'
  | 'PDF417'

export type EccLevel = 'L' | 'M' | 'Q' | 'H'

export interface LabelItem {
  type: 'TEXT' | 'BARCODE' | 'QRCODE' | 'BOX' | 'LINE'
  x: number   // horizontal position in dots (203 DPI: 1mm ≈ 8 dots)
  y: number   // vertical position in dots

  // TEXT
  value?: string
  font?: string        // '1'–'8' (built-in bitmap), or TTF name e.g. 'ARIAL.TTF'
  rotation?: 0 | 90 | 180 | 270
  xMultiplier?: number // 1–10  horizontal scale
  yMultiplier?: number // 1–10  vertical scale

  // BARCODE
  barcodeType?: BarcodeType
  barcodeHeight?: number  // dots
  humanReadable?: 0 | 1 | 2  // 0=none, 1=below, 2=above
  narrow?: number  // narrow bar width (dots)
  wide?: number    // wide bar width (dots)

  // QRCODE
  eccLevel?: EccLevel
  cellWidth?: number  // 1–10

  // BOX / LINE
  xEnd?: number
  yEnd?: number
  thickness?: number  // dots
}

export interface LabelConfig {
  /** Label width in mm (TE244 max: 104mm) */
  width: number
  /** Label height in mm */
  height: number
  /** Gap between labels in mm */
  gap?: number
  /** Number of copies */
  copies?: number
  items: LabelItem[]
}

export interface PrinterConfig {
  connectionType: 'usb' | 'tcp'
  /** USB device path, e.g. /dev/usb/lp0 or /dev/bus/usb/001/002 */
  devicePath?: string
  /** TCP hostname or IP (for Ethernet models) */
  host?: string
  /** TCP port — TSC default is 9100 */
  port?: number
  /** Connection/write timeout in ms */
  timeout?: number
}

export interface DetectedDevice {
  path: string
  type: 'usb-lp' | 'usb-raw'
  description: string
}

// ─── Core Service ─────────────────────────────────────────────────────────

export class TscPrinterService {
  private config: PrinterConfig

  constructor(config: Partial<PrinterConfig> = {}) {
    this.config = {
      connectionType: config.connectionType ?? 'usb',
      devicePath: config.devicePath,
      host: config.host,
      port: config.port ?? 9100,
      timeout: config.timeout ?? 5000,
    }
  }

  updateConfig(config: Partial<PrinterConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getConfig(): Readonly<PrinterConfig> {
    return { ...this.config }
  }

  // ─── TSPL2 Command Builder ─────────────────────────────────────────────

  /**
   * Converts a LabelConfig to a TSPL2 binary buffer ready to send to the printer.
   *
   * TSPL2 reference: https://www.tscprinters.com/cms/upload/download_en/TSPL_TSPL2_Programming_1217.pdf
   */
  buildTspl2(label: LabelConfig): Buffer {
    const lines: string[] = []
    const gap = label.gap ?? 2

    lines.push(`SIZE ${label.width} mm,${label.height} mm`)
    lines.push(`GAP ${gap} mm,0`)
    lines.push('DIRECTION 0')
    lines.push('REFERENCE 0,0')
    lines.push('OFFSET 0 mm')
    lines.push('SET PEEL OFF')
    lines.push('SET CUTTER OFF')
    lines.push('DENSITY 8')   // darkness 0–15; 8 = default
    lines.push('SPEED 4')     // print speed mm/s; TE244 supports up to 4ips
    lines.push('CLS')          // clear image buffer

    for (const item of label.items) {
      const rot = item.rotation ?? 0

      switch (item.type) {
        case 'TEXT': {
          const font = item.font ?? '2'
          const xm = item.xMultiplier ?? 1
          const ym = item.yMultiplier ?? 1
          const val = (item.value ?? '').replace(/"/g, '\\"')
          lines.push(`TEXT ${item.x},${item.y},"${font}",${rot},${xm},${ym},"${val}"`)
          break
        }

        case 'BARCODE': {
          const bt = item.barcodeType ?? '128'
          const bh = item.barcodeHeight ?? 80
          const hr = item.humanReadable ?? 1
          const nw = item.narrow ?? 2
          const wd = item.wide ?? 2
          const val = (item.value ?? '').replace(/"/g, '\\"')
          lines.push(`BARCODE ${item.x},${item.y},"${bt}",${bh},${hr},${rot},${nw},${wd},"${val}"`)
          break
        }

        case 'QRCODE': {
          const ecc = item.eccLevel ?? 'H'
          const cw = item.cellWidth ?? 5
          const val = (item.value ?? '').replace(/"/g, '\\"')
          lines.push(`QRCODE ${item.x},${item.y},${ecc},${cw},A,${rot},"${val}"`)
          break
        }

        case 'BOX': {
          const x2 = item.xEnd ?? item.x + 100
          const y2 = item.yEnd ?? item.y + 100
          const th = item.thickness ?? 2
          lines.push(`BOX ${item.x},${item.y},${x2},${y2},${th}`)
          break
        }

        case 'LINE': {
          // BAR command: x, y, width, height  (horizontal bar = line)
          const w = (item.xEnd ?? item.x + 100) - item.x
          const h = item.thickness ?? 2
          lines.push(`BAR ${item.x},${item.y},${w},${h}`)
          break
        }
      }
    }

    lines.push(`PRINT ${label.copies ?? 1},1`)

    // TSPL2 requires CRLF line endings
    return Buffer.from(lines.join('\r\n') + '\r\n', 'ascii')
  }

  // ─── Device Detection ──────────────────────────────────────────────────

  /**
   * Auto-detect connected TSC printers.
   * Checks /dev/usb/lp* first (fastest), then falls back to lsusb scan.
   */
  async detectDevices(): Promise<DetectedDevice[]> {
    const devices: DetectedDevice[] = []

    // Check standard USB line-printer nodes
    for (let i = 0; i <= 9; i++) {
      const p = `/dev/usb/lp${i}`
      try {
        fs.accessSync(p, fs.constants.W_OK)
        devices.push({ path: p, type: 'usb-lp', description: `USB line printer: ${p}` })
      } catch {
        // not present or no permission
      }
    }

    if (devices.length > 0) return devices

    // Fallback: scan lsusb for TSC vendor (1203) or generic thermal printers
    try {
      const { stdout } = await execAsync('lsusb 2>/dev/null')
      for (const line of stdout.split('\n')) {
        if (!/1203|tsc|thermal/i.test(line)) continue
        const m = line.match(/Bus\s+(\d+)\s+Device\s+(\d+)/i)
        if (!m) continue
        const p = `/dev/bus/usb/${m[1].padStart(3, '0')}/${m[2].padStart(3, '0')}`
        try {
          fs.accessSync(p, fs.constants.W_OK)
          devices.push({ path: p, type: 'usb-raw', description: `TSC USB device: ${p} (${line.trim()})` })
        } catch {
          devices.push({ path: p, type: 'usb-raw', description: `TSC USB device (no write permission): ${p} — run: sudo chmod 666 ${p}` })
        }
      }
    } catch {
      // lsusb unavailable
    }

    return devices
  }

  private async resolveDevicePath(): Promise<string> {
    if (this.config.devicePath) return this.config.devicePath
    const devices = await this.detectDevices()
    if (devices.length === 0) {
      throw new Error(
        'No TSC printer found on USB.\n' +
        'Troubleshooting:\n' +
        '  1. Make sure the printer is powered on and USB cable is connected.\n' +
        '  2. On Linux/Android run: sudo chmod 666 /dev/usb/lp0\n' +
        '  3. On Android (Termux) you may need root: su -c "chmod 666 /dev/usb/lp0"\n' +
        '  4. Alternatively, set connectionType to "tcp" and provide the printer IP.'
      )
    }
    return devices[0].path
  }

  // ─── Print ────────────────────────────────────────────────────────────

  async print(label: LabelConfig): Promise<void> {
    const buffer = this.buildTspl2(label)
    await this.sendRaw(buffer)
  }

  /**
   * Send raw TSPL2 command string directly (for advanced use).
   */
  async printRawCommands(tspl2: string): Promise<void> {
    const normalized = tspl2.replace(/(?<!\r)\n/g, '\r\n')
    await this.sendRaw(Buffer.from(normalized, 'ascii'))
  }

  async sendRaw(data: Buffer): Promise<void> {
    if (this.config.connectionType === 'tcp') {
      return this.sendViaTcp(data)
    }
    return this.sendViaUsb(data)
  }

  private async sendViaUsb(data: Buffer): Promise<void> {
    const devicePath = await this.resolveDevicePath()

    return new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(devicePath, { flags: 'w' })

      stream.once('error', (err) =>
        reject(new Error(`USB write error (${devicePath}): ${err.message}`))
      )
      stream.once('finish', resolve)

      stream.write(data, (err) => {
        if (err) {
          stream.destroy()
          reject(new Error(`USB write error: ${err.message}`))
        } else {
          stream.end()
        }
      })
    })
  }

  private sendViaTcp(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.config.host) {
        return reject(new Error('TCP host not configured. Set host in printer config.'))
      }

      const socket = new net.Socket()
      let settled = false

      const done = (err?: Error) => {
        if (settled) return
        settled = true
        socket.destroy()
        if (err) reject(err)
        else resolve()
      }

      const timer = setTimeout(
        () => done(new Error(`TCP timeout connecting to ${this.config.host}:${this.config.port}`)),
        this.config.timeout
      )

      socket.connect(this.config.port!, this.config.host, () => {
        socket.write(data, (err) => {
          clearTimeout(timer)
          done(err ? new Error(`TCP write error: ${err.message}`) : undefined)
        })
      })

      socket.on('error', (err) => {
        clearTimeout(timer)
        done(new Error(`TCP connection error: ${err.message}`))
      })
    })
  }

  // ─── Status Check ─────────────────────────────────────────────────────

  async checkStatus(): Promise<{ connected: boolean; devicePath?: string; error?: string }> {
    try {
      if (this.config.connectionType === 'tcp') {
        await this.pingTcp()
        return { connected: true }
      }
      const devicePath = await this.resolveDevicePath()
      return { connected: true, devicePath }
    } catch (err) {
      return { connected: false, error: (err as Error).message }
    }
  }

  private pingTcp(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.config.host) return reject(new Error('No TCP host configured'))

      const socket = new net.Socket()
      let settled = false
      const done = (err?: Error) => {
        if (settled) return
        settled = true
        socket.destroy()
        if (err) reject(err)
        else resolve()
      }

      const timer = setTimeout(
        () => done(new Error(`Timeout pinging ${this.config.host}:${this.config.port}`)),
        this.config.timeout
      )

      socket.connect(this.config.port!, this.config.host, () => {
        clearTimeout(timer)
        done()
      })
      socket.on('error', (err) => { clearTimeout(timer); done(err) })
    })
  }

  // ─── Built-in Label Presets ───────────────────────────────────────────

  static shippingLabel(data: {
    recipientName: string
    address: string
    trackingNumber: string
  }): LabelConfig {
    return {
      width: 100, height: 60, gap: 2,
      items: [
        { type: 'TEXT', x: 10, y: 10,  value: 'SHIP TO', font: '3', xMultiplier: 1, yMultiplier: 1 },
        { type: 'TEXT', x: 10, y: 35,  value: data.recipientName, font: '3', xMultiplier: 2, yMultiplier: 2 },
        { type: 'TEXT', x: 10, y: 80,  value: data.address, font: '2', xMultiplier: 1, yMultiplier: 1 },
        { type: 'LINE', x: 0,  y: 120, xEnd: 800, thickness: 2 },
        { type: 'TEXT', x: 10, y: 130, value: `Tracking: ${data.trackingNumber}`, font: '2' },
        { type: 'BARCODE', x: 10, y: 160, value: data.trackingNumber, barcodeType: '128', barcodeHeight: 80, humanReadable: 1 },
      ],
    }
  }

  static productLabel(data: {
    name: string
    sku: string
    price?: string
    barcode: string
  }): LabelConfig {
    return {
      width: 80, height: 40, gap: 2,
      items: [
        { type: 'TEXT', x: 10, y: 10, value: data.name, font: '3', xMultiplier: 1, yMultiplier: 1 },
        { type: 'TEXT', x: 10, y: 40, value: `SKU: ${data.sku}`, font: '2' },
        ...(data.price ? [{ type: 'TEXT' as const, x: 400, y: 40, value: data.price, font: '3' }] : []),
        { type: 'BARCODE', x: 10, y: 70, value: data.barcode, barcodeType: '128', barcodeHeight: 60, humanReadable: 1 },
      ],
    }
  }

  static qrLabel(data: {
    title: string
    qrValue: string
    subtitle?: string
  }): LabelConfig {
    return {
      width: 60, height: 40, gap: 2,
      items: [
        { type: 'QRCODE', x: 10, y: 10, value: data.qrValue, eccLevel: 'H', cellWidth: 5 },
        { type: 'TEXT', x: 200, y: 15,  value: data.title, font: '3', xMultiplier: 1, yMultiplier: 1 },
        ...(data.subtitle
          ? [{ type: 'TEXT' as const, x: 200, y: 60, value: data.subtitle, font: '2' }]
          : []),
      ],
    }
  }

  static testLabel(): LabelConfig {
    return {
      width: 60, height: 40, gap: 2,
      items: [
        { type: 'TEXT',    x: 10,  y: 10, value: 'TSC TE244 TEST',    font: '3', xMultiplier: 1, yMultiplier: 1 },
        { type: 'TEXT',    x: 10,  y: 40, value: new Date().toISOString().slice(0, 19), font: '2' },
        { type: 'BARCODE', x: 10,  y: 80, value: 'TEST1234567', barcodeType: '128', barcodeHeight: 60, humanReadable: 1 },
        { type: 'QRCODE',  x: 350, y: 10, value: 'TSC TE244 OK', eccLevel: 'H', cellWidth: 4 },
        { type: 'BOX',     x: 5,   y: 5,  xEnd: 475, yEnd: 315, thickness: 2 },
      ],
    }
  }
}

// Singleton — update config at runtime via printerService.updateConfig(...)
export const printerService = new TscPrinterService()
