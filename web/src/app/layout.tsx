import type { Metadata } from 'next'
import './globals.css'
import { AppChrome } from '@/components/app-chrome'

export const metadata: Metadata = {
  title: 'AI Code Review UI',
  description: 'Minimal stable UI for centralized code review',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  )
}
