'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { NavLinks } from '@/components/nav-links'
import { PanelLeftOpen, PanelLeftClose, Sparkles, PanelRightOpen } from 'lucide-react'

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [manualCollapsed, setManualCollapsed] = useState(false)
  const autoCollapsed = pathname.includes('/editor')
  const collapsed = autoCollapsed || manualCollapsed

  return (
    <div className={`app-shell${collapsed ? ' collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles size={20} style={{ flexShrink: 0 }} />
          {collapsed ? 'AI' : 'AI Code Review'}
        </div>
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
              {collapsed ? <PanelRightOpen size={16} style={{ marginRight: '6px' }} /> : <PanelLeftOpen size={16} style={{ marginRight: '6px' }} />}
              {autoCollapsed ? 'Menu Hidden in Editor' : collapsed ? 'Open Menu' : 'Hide Menu'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sparkles size={24} style={{ color: '#60a5fa' }} />
              <div>
                <strong style={{ fontSize: '15px' }}>OpenCode Review Manager</strong>
                <div className="muted">Centralized documentation and review operations</div>
              </div>
            </div>
          </div>
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  )
}
