'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { NavLinks } from '@/components/nav-links'

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [manualCollapsed, setManualCollapsed] = useState(false)
  const autoCollapsed = pathname.includes('/editor')
  const collapsed = autoCollapsed || manualCollapsed

  return (
    <div className={`app-shell${collapsed ? ' collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">{collapsed ? 'AI' : 'AI Code Review'}</div>
        <NavLinks />
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setManualCollapsed((value) => !value)}
              aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
              disabled={autoCollapsed}
            >
              {autoCollapsed ? 'Menu Hidden in Editor' : collapsed ? 'Open Menu' : 'Hide Menu'}
            </button>
            <div>
              <strong>OpenCode Review Manager</strong>
              <div className="muted">Centralized documentation and review operations</div>
            </div>
          </div>
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  )
}
