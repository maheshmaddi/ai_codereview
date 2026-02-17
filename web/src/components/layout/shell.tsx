'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  FolderOpen,
  History,
  Settings,
  LogOut,
  Code2,
  ChevronRight,
} from 'lucide-react'
import { clsx } from 'clsx'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/history', label: 'Review History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-brand-900 text-white flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-brand-700">
          <Code2 className="w-7 h-7 text-brand-100" />
          <div>
            <p className="text-sm font-semibold text-white leading-tight">OpenCode</p>
            <p className="text-xs text-brand-300 leading-tight">Code Review</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  active
                    ? 'bg-brand-700 text-white font-medium'
                    : 'text-brand-200 hover:bg-brand-800 hover:text-white'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
                {active && <ChevronRight className="w-3 h-3 ml-auto" />}
              </Link>
            )
          })}
        </nav>

        {/* User info */}
        <div className="px-4 py-3 border-t border-brand-700">
          <p className="text-xs text-brand-300 truncate">{session?.user?.name}</p>
          <p className="text-xs text-brand-400 truncate">{session?.user?.email}</p>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 mt-2 text-xs text-brand-300 hover:text-white transition-colors"
          >
            <LogOut className="w-3 h-3" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
