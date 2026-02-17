import { NextResponse } from 'next/server'
import { API_BASE } from '@/lib/api'

interface Ctx {
  params: { projectId: string }
}

export async function POST(request: Request, { params }: Ctx) {
  const projectId = decodeURIComponent(params.projectId)
  await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/initialize`, {
    method: 'POST',
  })
  return NextResponse.redirect(new URL(`/projects/${encodeURIComponent(projectId)}`, request.url), 303)
}
