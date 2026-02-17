/**
 * OpenCode SDK integration for triggering review commands programmatically
 */

import { createOpencodeClient } from '@opencode-ai/sdk'

const OPENCODE_BASE_URL = process.env.OPENCODE_SERVER_URL ?? 'http://localhost:4096'

export function getOpencodeClient() {
  return createOpencodeClient({
    baseUrl: OPENCODE_BASE_URL,
    throwOnError: true,
  })
}

/**
 * Create a new OpenCode session and run a command within it.
 * Returns the session ID for status polling.
 */
export async function runCommand(
  command: string,
  args?: string
): Promise<string> {
  const client = getOpencodeClient()

  // Create a new session
  const sessionResponse = await client.session.create({
    body: { title: `codereview: ${command}` },
  })

  const session = sessionResponse.data
  if (!session?.id) {
    throw new Error('Failed to create OpenCode session')
  }

  // Send the command prompt
  const prompt = args ? `/${command} ${args}` : `/${command}`

  // Fire the prompt asynchronously (don't block waiting for completion)
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
    const messages = await client.session.messages({
      path: { id: sessionId },
    })

    const allMessages = messages.data ?? []
    if (allMessages.length === 0) {
      return { status: 'running', progress: 'Initializing...' }
    }

    const lastMessage = allMessages[allMessages.length - 1]
    const info = lastMessage?.info

    // Check if session is still running (heuristic: no assistant message yet)
    if (info?.role === 'assistant' && info?.status === 'completed') {
      return { status: 'completed' }
    }

    if (info?.status === 'error') {
      return { status: 'error', progress: 'Command failed. Check server logs.' }
    }

    return { status: 'running', progress: 'Processing...' }
  } catch {
    return { status: 'error', progress: 'Failed to connect to OpenCode server' }
  }
}
