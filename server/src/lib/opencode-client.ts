/**
 * OpenCode SDK integration for triggering review commands programmatically
 */

import { createOpencodeClient } from '@opencode-ai/sdk'
import { getGlobalSetting } from '../db/database.js'

const OPENCODE_BASE_URL = process.env.OPENCODE_SERVER_URL ?? 'http://localhost:4096'

export function getOpencodeClient() {
  return createOpencodeClient({
    baseUrl: OPENCODE_BASE_URL,
    responseStyle: 'data',
    throwOnError: true,
  })
}

/**
 * Get available models from OpenCode configuration
 */
export async function getAvailableModels(): Promise<Array<{ id: string; name: string; provider: string }>> {
  const client = getOpencodeClient()

  try {
    const configResp = await client.config.get()
    const config = (configResp as any)?.data ?? (configResp as any)

    const models: Array<{ id: string; name: string; provider: string }> = []

    if (config?.provider) {
      for (const [providerId, providerConfig] of Object.entries(config.provider)) {
        const provider = providerConfig as any
        if (provider?.models) {
          for (const [modelKey, modelInfo] of Object.entries(provider.models)) {
            const model = modelInfo as any
            const modelId = `${providerId}/${modelKey}`
            models.push({
              id: modelId,
              name: model?.name ?? modelKey,
              provider: providerId,
            })
          }
        }
      }
    }

    return models
  } catch (e) {
    console.error('Failed to fetch models from OpenCode:', e)
    return []
  }
}

/**
 * Create a new OpenCode session and run a command within it.
 * Returns the session ID for status polling.
 * Uses global review_model setting.
 */
export async function runCommand(
  command: string,
  args?: string
): Promise<string> {
  const client = getOpencodeClient()

  // Use global model setting
  const globalModel = getGlobalSetting('review_model')
  if (globalModel) {
    console.log(`Using global review model: ${globalModel}`)
  }

  // Create a new session
  // Note: Model should be configured in OpenCode config or environment
  const sessionResp = await client.session.create({
    body: {
      title: `codereview: ${command}`,
    },
  }) as unknown as { data?: { id?: string }; id?: string }

  const session = sessionResp?.data ?? sessionResp

  if (!session?.id) {
    throw new Error('Failed to create OpenCode session')
  }

  // Send the command prompt
  const prompt = args ? `/${command} ${args}` : `/${command}`

  // Fire the prompt asynchronously (don't block waiting for completion).
  // Slash-commands are sent as regular prompt text (eg. "/codereview 2 org/repo").
  void client.session.prompt({
    path: { id: session.id },
    body: {
      parts: [{ type: 'text', text: prompt }],
    },
  })

  return session.id
}

/**
 * Poll session status to check if a command has completed.
 */
export async function getSessionStatus(sessionId: string): Promise<{
  status: 'running' | 'completed' | 'error'
  progress?: string
}> {
  const client = getOpencodeClient()

  try {
    const messagesResp = await client.session.messages({
      path: { id: sessionId },
    }) as unknown as { data?: Array<{ info?: { role?: string } }> } | Array<{ info?: { role?: string } }>

    const allMessages = Array.isArray(messagesResp)
      ? messagesResp
      : (messagesResp?.data ?? [])

    if (allMessages.length === 0) {
      return { status: 'running', progress: 'Initializing...' }
    }

    const lastMessage = allMessages[allMessages.length - 1]?.info

    if (lastMessage?.role === 'assistant') {
      return { status: 'completed' }
    }

    return { status: 'running', progress: 'Processing...' }
  } catch (e) {
    return { status: 'error', progress: `Failed to connect to OpenCode server: ${(e as Error).message}` }
  }
}

/**
 * Create a new OpenCode session in a specific directory and run a command.
 * Returns the session ID.
 */
export async function runCommandInDir(
  command: string,
  directory: string,
  args?: string
): Promise<string> {
  // Use a client without throwOnError so we can handle errors ourselves
  const client = createOpencodeClient({
    baseUrl: OPENCODE_BASE_URL,
    responseStyle: 'data',
    throwOnError: false,
  })

  const globalModel = getGlobalSetting('review_model')
  if (globalModel) {
    console.log(`Using global review model: ${globalModel}`)
  }

  console.log(`Creating OpenCode session in directory: ${directory}`)

  // Create session with directory context
  const sessionResp = await client.session.create({
    query: { directory },
    body: {
      title: `codereview: ${command}`,
    },
  } as any) as unknown as { data?: { id?: string }; id?: string; error?: unknown }

  const session = (sessionResp as any)?.data ?? sessionResp

  if (!session?.id) {
    const errDetail = JSON.stringify((sessionResp as any)?.error ?? sessionResp)
    throw new Error(`Failed to create OpenCode session: ${errDetail}`)
  }

  console.log(`OpenCode session created: ${session.id}`)

  const prompt = args ? `/${command} ${args}` : `/${command}`

  // Fire prompt asynchronously — catch errors so they don't crash the process
  client.session.prompt({
    path: { id: session.id },
    body: {
      parts: [{ type: 'text', text: prompt }],
    },
  } as any).catch((e: unknown) => {
    console.error(`Prompt fire error for session ${session.id}:`, e)
  })

  return session.id
}

export type RunResult =
  | { mode: 'sdk'; sessionId: string }
  | { mode: 'cli'; exitCode: number }

/**
 * Try SDK first, fall back to opencode CLI if SDK is unavailable.
 * onOutput is called with each line of CLI output (CLI mode only).
 * Returns { mode: 'sdk', sessionId } or { mode: 'cli', exitCode }.
 */
export async function runCommandInDirWithFallback(
  command: string,
  directory: string,
  onOutput: (line: string) => void,
  args?: string
): Promise<RunResult> {
  // --- Try SDK first ---
  /*
  try {
    const sessionId = await runCommandInDir(command, directory, args)
    return { mode: 'sdk', sessionId }
  } catch (sdkErr) {
    const sdkMsg = (sdkErr as Error).message
    console.warn(`SDK failed (${sdkMsg}), falling back to opencode CLI`)
    onOutput(`[fallback] SDK unavailable (${sdkMsg}), using opencode CLI...`)
  }
  */
  console.log('Using CLI mode (forced) for command:', command)
  onOutput('[cli] Starting in CLI mode...')


  // --- CLI fallback ---
  const { spawn } = await import('child_process')

  // opencode run --command <command> --dir <directory>
  const cliArgs = ['run', '--command', command, '--dir', directory]
  if (args) cliArgs.push(args)

  const exitCode = await new Promise<number>((resolve, reject) => {
    const proc = spawn(
      'opencode',
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
  const client = getOpencodeClient()
  let lastCount = 0
  let stableCount = 0
  const MAX_STABLE = 30 // 30 * 2s = 60s of no new messages = done

  while (!signal?.aborted) {
    await new Promise((r) => setTimeout(r, 2000))

    try {
      const messagesResp = await client.session.messages({
        path: { id: sessionId },
      }) as unknown as Array<any> | { data?: Array<any> }

      const messages = Array.isArray(messagesResp)
        ? messagesResp
        : (messagesResp as any)?.data ?? []

      // Emit new messages
      for (let i = lastCount; i < messages.length; i++) {
        const msg = messages[i]
        const role = msg?.info?.role ?? msg?.role
        const parts = msg?.parts ?? []
        for (const part of parts) {
          if (part?.type === 'text' && part?.text) {
            onMessage(`[${role ?? 'ai'}] ${part.text.slice(0, 200)}`)
          } else if (part?.type === 'tool-invocation') {
            const toolName = part?.toolInvocation?.toolName ?? part?.toolName
            if (toolName) onMessage(`[tool] ${toolName}`)
          }
        }
      }

      if (messages.length === lastCount) {
        stableCount++
      } else {
        stableCount = 0
        lastCount = messages.length
      }

      // Check if last message is from assistant (done)
      const last = messages[messages.length - 1]
      const lastRole = last?.info?.role ?? last?.role
      if (lastRole === 'assistant' && messages.length > 0) {
        return 'completed'
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

