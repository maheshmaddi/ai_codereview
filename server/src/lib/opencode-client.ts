/**
 * OpenCode SDK integration for triggering review commands programmatically
 */

import { createOpencodeClient } from '@opencode-ai/sdk'

const OPENCODE_BASE_URL = process.env.OPENCODE_SERVER_URL ?? 'http://localhost:4096'

export function getOpencodeClient() {
  return createOpencodeClient({
    baseUrl: OPENCODE_BASE_URL,
    responseStyle: 'data',
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
