/**
 * OpenClaw API integration for triggering review commands programmatically
 * Replaces: @opencode-ai/sdk with OpenClaw API calls
 */

import axios from 'axios'
import { getGlobalSetting } from '../db/database.js'

const OPENCLAW_BASE_URL = process.env.OPENCLAW_SERVER_URL ?? 'http://localhost:3000'

/**
 * OpenClaw API client
 */
export function getOpenClawClient() {
  return axios.create({
    baseURL: OPENCLAW_BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

/**
 * Get available models from OpenClaw configuration
 */
export async function getAvailableModels(): Promise<Array<{ id: string; name: string; provider: string }>> {
  const client = getOpenClawClient()

  try {
    // OpenClaw exposes models via session_status or config endpoint
    const response = await client.get('/status')
    const status = response.data

    const models: Array<{ id: string; name: string; provider: string }> = []

    // OpenClaw supports multiple providers: zai (GLM), anthropic (Claude), openai (Codex)
    const supportedModels = [
      { id: 'zai/glm-5', name: 'GLM-5', provider: 'zai' },
      { id: 'zai/glm-4.5', name: 'GLM-4.5', provider: 'zai' },
      { id: 'zai/glm-4.5-air', name: 'GLM-4.5 Air', provider: 'zai' },
      { id: 'zai/glm-4.5-airx', name: 'GLM-4.5 AirX', provider: 'zai' },
      { id: 'zai/glm-4.5-flash', name: 'GLM-4.5 Flash', provider: 'zai' },
      { id: 'zai/glm-4.6', name: 'GLM-4.6', provider: 'zai' },
      { id: 'zai/glm-4.7', name: 'GLM-4.7', provider: 'zai' },
      { id: 'zai/glm-4.7-flash', name: 'GLM-4.7 Flash', provider: 'zai' },
      { id: 'zai/glm-4.7-flashx', name: 'GLM-4.7 FlashX', provider: 'zai' },
      { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', provider: 'anthropic' },
      { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'anthropic' },
      { id: 'openai/codex', name: 'Codex', provider: 'openai' },
    ]

    return supportedModels
  } catch (e) {
    console.error('Failed to fetch models from OpenClaw:', e)
    return []
  }
}

/**
 * Trigger an OpenClaw skill (replaces OpenCode command)
 * Returns the session ID for status polling.
 */
export async function runCommand(
  command: string,
  args?: string
): Promise<string> {
  const client = getOpenClawClient()

  // Use global model setting
  const globalModel = await getGlobalSetting('review_model')
  const model = globalModel || 'zai/glm-5'

  console.log(`Using model: ${model}`)

  // Map OpenCode commands to OpenClaw skills
  const skillMap: Record<string, string> = {
    'codereview-int-deep': 'codereview-init',
    'codereview': 'codereview-pr',
    'pushcomments': 'codereview-push',
  }

  const skillName = skillMap[command] || command

  // Trigger skill via OpenClaw sessions_spawn
  try {
    const response = await client.post('/api/sessions/spawn', {
      task: args ? `${skillName} ${args}` : skillName,
      mode: 'run',
      model: model,
      runtime: 'subagent',
    })

    const sessionId = response.data?.sessionId || response.data?.id

    if (!sessionId) {
      throw new Error('Failed to create OpenClaw session')
    }

    return sessionId
  } catch (error) {
    console.error('Failed to trigger OpenClaw skill:', error)
    throw error
  }
}

/**
 * Poll session status to check if a command has completed.
 */
export async function getSessionStatus(sessionId: string): Promise<{
  status: 'running' | 'completed' | 'error'
  progress?: string
}> {
  const client = getOpenClawClient()

  try {
    const response = await client.get(`/api/sessions/${sessionId}`)
    const session = response.data

    if (session?.status === 'completed' || session?.state === 'done') {
      return { status: 'completed' }
    }

    if (session?.status === 'error' || session?.state === 'error') {
      return { status: 'error', progress: session?.error || 'Unknown error' }
    }

    return { status: 'running', progress: session?.progress || 'Processing...' }
  } catch (e) {
    return { status: 'error', progress: `Failed to connect to OpenClaw server: ${(e as Error).message}` }
  }
}

/**
 * Create a new OpenClaw session in a specific directory and run a command.
 * Returns the session ID.
 */
export async function runCommandInDir(
  command: string,
  directory: string,
  args?: string
): Promise<string> {
  const client = getOpenClawClient()

  const globalModel = await getGlobalSetting('review_model')
  const model = globalModel || 'zai/glm-5'

  console.log(`Using model: ${model}`)
  console.log(`Creating OpenClaw session in directory: ${directory}`)

  // Map OpenCode commands to OpenClaw skills
  const skillMap: Record<string, string> = {
    'codereview-int-deep': 'codereview-init',
    'codereview': 'codereview-pr',
    'pushcomments': 'codereview-push',
  }

  const skillName = skillMap[command] || command

  // Trigger skill via OpenClaw sessions_spawn with cwd
  try {
    const response = await client.post('/api/sessions/spawn', {
      task: args ? `${skillName} ${args}` : skillName,
      mode: 'run',
      model: model,
      runtime: 'subagent',
      cwd: directory,
    })

    const sessionId = response.data?.sessionId || response.data?.id

    if (!sessionId) {
      throw new Error('Failed to create OpenClaw session')
    }

    console.log(`OpenClaw session created: ${sessionId}`)

    return sessionId
  } catch (error: any) {
    const errDetail = error?.response?.data || error.message
    throw new Error(`Failed to create OpenClaw session: ${JSON.stringify(errDetail)}`)
  }
}

export type RunResult =
  | { mode: 'api'; sessionId: string }
  | { mode: 'cli'; exitCode: number }

/**
 * Try API first, fall back to openclaw CLI if API is unavailable.
 * onOutput is called with each line of CLI output (CLI mode only).
 * Returns { mode: 'api', sessionId } or { mode: 'cli', exitCode }.
 */
export async function runCommandInDirWithFallback(
  command: string,
  directory: string,
  onOutput: (line: string) => void,
  args?: string
): Promise<RunResult> {
  // --- Try API first ---
  try {
    const sessionId = await runCommandInDir(command, directory, args)
    return { mode: 'api', sessionId }
  } catch (apiErr) {
    const apiMsg = (apiErr as Error).message
    console.warn(`API failed (${apiMsg}), falling back to openclaw CLI`)
    onOutput(`[fallback] API unavailable (${apiMsg}), using openclaw CLI...`)
  }

  // --- CLI fallback ---
  const { spawn } = await import('child_process')

  // openclaw run --skill <skill> --cwd <directory>
  const skillMap: Record<string, string> = {
    'codereview-int-deep': 'codereview-init',
    'codereview': 'codereview-pr',
    'pushcomments': 'codereview-push',
  }

  const skillName = skillMap[command] || command
  const cliArgs = ['run', '--skill', skillName, '--cwd', directory]
  if (args) cliArgs.push('--args', args)

  const exitCode = await new Promise<number>((resolve, reject) => {
    const proc = spawn(
      'openclaw',
      cliArgs,
      {
        cwd: directory,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      }
    )

    proc.stdout.on('data', (chunk: Buffer) => {
      chunk.toString().split('\n').forEach((line) => {
        const trimmed = line.trim()
        if (trimmed) onOutput(`[cli] ${trimmed}`)
      })
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      chunk.toString().split('\n').forEach((line) => {
        const trimmed = line.trim()
        if (trimmed) onOutput(`[cli] ${trimmed}`)
      })
    })

    proc.on('close', (code) => resolve(code ?? 0))
    proc.on('error', reject)
  })

  return { mode: 'cli', exitCode }
}


/**
 * Poll session messages until completion, calling onMessage for each new message.
 * Returns 'completed' or 'error'.
 */
export async function pollSessionMessages(
  sessionId: string,
  onMessage: (text: string) => void,
  signal?: AbortSignal
): Promise<'completed' | 'error'> {
  const client = getOpenClawClient()
  let lastCount = 0
  let stableCount = 0
  const MAX_STABLE = 30 // 30 * 2s = 60s of no new messages = done

  while (!signal?.aborted) {
    await new Promise((r) => setTimeout(r, 2000))

    try {
      const response = await client.get(`/api/sessions/${sessionId}/history`)
      const messages = response.data?.messages || []

      // Emit new messages
      for (let i = lastCount; i < messages.length; i++) {
        const msg = messages[i]
        const role = msg?.role || 'assistant'
        const content = msg?.content || msg?.text

        if (content) {
          onMessage(`[${role}] ${content.slice(0, 200)}`)
        }
      }

      if (messages.length === lastCount) {
        stableCount++
      } else {
        stableCount = 0
        lastCount = messages.length
      }

      // Check if session is completed
      const statusResp = await client.get(`/api/sessions/${sessionId}`)
      const status = statusResp.data?.status || statusResp.data?.state

      if (status === 'completed' || status === 'done') {
        return 'completed'
      }

      if (status === 'error') {
        return 'error'
      }

      if (stableCount >= MAX_STABLE) {
        return 'completed'
      }
    } catch (e) {
      onMessage(`[error] ${(e as Error).message}`)
      return 'error'
    }
  }

  return 'completed'
}

// Backwards compatibility aliases
export const getOpencodeClient = getOpenClawClient
