'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FolderOpen, LayoutDashboard, History, Settings } from 'lucide-react'

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/history', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function NavLinks() {
  const pathname = usePathname()

  return (
    <>
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
        const Icon = link.icon
        return (
          <Link key={link.href} className={`nav-link${active ? ' active' : ''}`} href={link.href}>
            <span className="nav-icon"><Icon size={16} /></span>
            <span className="nav-label">{link.label}</span>
          </Link>
        )
      })}
    </>
  )
}
