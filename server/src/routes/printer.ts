/**
 * TSC TE244 Printer API Routes
 *
 * POST /api/printer/config          Update printer connection config
 * GET  /api/printer/config          Get current config
 * GET  /api/printer/devices         Auto-detect USB printer devices
 * GET  /api/printer/status          Check if printer is reachable
 * POST /api/printer/print           Print a label (preset or custom)
 * POST /api/printer/print/raw       Send raw TSPL2 commands
 * POST /api/printer/test            Print a built-in test label
 * GET  /api/printer/jobs            List recent print jobs
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { printerService, TscPrinterService, LabelConfig, LabelItem } from '../lib/tsc-printer.js'
import { getDb } from '../db/database.js'

export const printerRouter = Router()

// ─── Validation Schemas ────────────────────────────────────────────────────

const ConfigSchema = z.object({
  connectionType: z.enum(['usb', 'tcp']),
  devicePath: z.string().optional(),
  host: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  timeout: z.number().int().min(500).max(30000).optional(),
})

const LabelItemSchema: z.ZodType<LabelItem> = z.object({
  type: z.enum(['TEXT', 'BARCODE', 'QRCODE', 'BOX', 'LINE']),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  value: z.string().optional(),
  font: z.string().optional(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  xMultiplier: z.number().int().min(1).max(10).optional(),
  yMultiplier: z.number().int().min(1).max(10).optional(),
  barcodeType: z.enum(['128', '39', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'ITF', 'MSI', 'CODABAR', 'PDF417']).optional(),
  barcodeHeight: z.number().int().min(1).optional(),
  humanReadable: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  narrow: z.number().int().min(1).optional(),
  wide: z.number().int().min(1).optional(),
  eccLevel: z.enum(['L', 'M', 'Q', 'H']).optional(),
  cellWidth: z.number().int().min(1).max(10).optional(),
  xEnd: z.number().int().min(0).optional(),
  yEnd: z.number().int().min(0).optional(),
  thickness: z.number().int().min(1).optional(),
})

const LabelConfigSchema = z.object({
  width: z.number().positive().max(104),    // TE244 max 104mm
  height: z.number().positive(),
  gap: z.number().min(0).optional(),
  copies: z.number().int().min(1).max(999).optional(),
  items: z.array(LabelItemSchema).min(1),
})

const PrintBodySchema = z.object({
  label: LabelConfigSchema.optional(),
  preset: z.enum(['shipping', 'product', 'qr', 'test']).optional(),
  presetData: z.record(z.string()).optional(),
})

const RawPrintSchema = z.object({
  commands: z.string().min(1),
})

// ─── Helper ────────────────────────────────────────────────────────────────

async function logJob(
  type: string,
  payload: string,
  status: 'success' | 'error',
  error?: string
): Promise<void> {
  try {
    const db = getDb()
    await db.run(
      `INSERT INTO print_jobs (job_type, payload, status, error, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      type, payload, status, error ?? null
    )
  } catch {
    // Non-fatal — logging should not break print jobs
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────

/** GET /api/printer/config */
printerRouter.get('/config', (_req: Request, res: Response) => {
  res.json(printerService.getConfig())
})

/** POST /api/printer/config */
printerRouter.post('/config', async (req: Request, res: Response) => {
  const result = ConfigSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: 'Invalid config', details: result.error.flatten() })
    return
  }
  printerService.updateConfig(result.data)
  res.json({ success: true, config: printerService.getConfig() })
})

/** GET /api/printer/devices */
printerRouter.get('/devices', async (_req: Request, res: Response) => {
  try {
    const devices = await printerService.detectDevices()
    res.json({ devices })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

/** GET /api/printer/status */
printerRouter.get('/status', async (_req: Request, res: Response) => {
  const status = await printerService.checkStatus()
  res.status(status.connected ? 200 : 503).json(status)
})

/** POST /api/printer/print */
printerRouter.post('/print', async (req: Request, res: Response) => {
  const result = PrintBodySchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: 'Invalid request body', details: result.error.flatten() })
    return
  }

  const { label, preset, presetData } = result.data
  let config: LabelConfig | null = null

  if (label) {
    config = label as LabelConfig
  } else if (preset === 'test') {
    config = TscPrinterService.testLabel()
  } else if (preset === 'shipping' && presetData) {
    config = TscPrinterService.shippingLabel({
      recipientName: presetData.recipientName ?? '',
      address: presetData.address ?? '',
      trackingNumber: presetData.trackingNumber ?? '',
    })
  } else if (preset === 'product' && presetData) {
    config = TscPrinterService.productLabel({
      name: presetData.name ?? '',
      sku: presetData.sku ?? '',
      price: presetData.price,
      barcode: presetData.barcode ?? '',
    })
  } else if (preset === 'qr' && presetData) {
    config = TscPrinterService.qrLabel({
      title: presetData.title ?? '',
      qrValue: presetData.qrValue ?? '',
      subtitle: presetData.subtitle,
    })
  } else {
    res.status(400).json({ error: 'Provide either a label config or a preset + presetData' })
    return
  }

  try {
    await printerService.print(config)
    await logJob(preset ?? 'custom', JSON.stringify(config), 'success')
    res.json({ success: true, copies: config.copies ?? 1 })
  } catch (err) {
    const message = (err as Error).message
    await logJob(preset ?? 'custom', JSON.stringify(config), 'error', message)
    res.status(500).json({ error: message })
  }
})

/** POST /api/printer/print/raw — Send TSPL2 commands directly */
printerRouter.post('/print/raw', async (req: Request, res: Response) => {
  const result = RawPrintSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: 'Invalid request body', details: result.error.flatten() })
    return
  }

  try {
    await printerService.printRawCommands(result.data.commands)
    await logJob('raw', result.data.commands.slice(0, 500), 'success')
    res.json({ success: true })
  } catch (err) {
    const message = (err as Error).message
    await logJob('raw', result.data.commands.slice(0, 500), 'error', message)
    res.status(500).json({ error: message })
  }
})

/** POST /api/printer/test — Convenience: print a test label */
printerRouter.post('/test', async (_req: Request, res: Response) => {
  const config = TscPrinterService.testLabel()
  try {
    await printerService.print(config)
    await logJob('test', '', 'success')
    res.json({ success: true, message: 'Test label printed' })
  } catch (err) {
    const message = (err as Error).message
    await logJob('test', '', 'error', message)
    res.status(500).json({ error: message })
  }
})

/** GET /api/printer/jobs — Recent print job history */
printerRouter.get('/jobs', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200)
    const db = getDb()
    const jobs = await db.all(
      `SELECT id, job_type, status, error, created_at
       FROM print_jobs
       ORDER BY created_at DESC
       LIMIT ?`,
      limit
    )
    res.json({ jobs })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

/** GET /api/printer/tspl2/preview — Preview TSPL2 commands for a label without printing */
printerRouter.post('/tspl2/preview', async (req: Request, res: Response) => {
  const result = LabelConfigSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: 'Invalid label config', details: result.error.flatten() })
    return
  }
  const buffer = printerService.buildTspl2(result.data as LabelConfig)
  res.json({ tspl2: buffer.toString('ascii'), byteLength: buffer.length })
})
