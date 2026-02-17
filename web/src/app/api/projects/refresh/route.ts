import { NextResponse } from 'next/server'
import { API_BASE } from '@/lib/api'

export async function POST(request: Request) {
  await fetch(`${API_BASE}/api/projects/refresh`, { method: 'POST' })
  return NextResponse.redirect(new URL('/projects', request.url), 303)
}
