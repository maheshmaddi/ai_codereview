'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, Folder } from 'lucide-react'
import { clsx } from 'clsx'
import type { CodeReviewIndex } from '@/lib/types'

interface ModuleTreeProps {
  projectId: string
  index: CodeReviewIndex
  editorBase: string
}

export function ModuleTree({ projectId, index, editorBase }: ModuleTreeProps) {
  const pathname = usePathname()

  const rootHref = `${editorBase}`
  const rootActive = pathname === rootHref

  return (
    <div className="px-2">
      {/* Root document */}
      <Link
        href={rootHref}
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
          rootActive
            ? 'bg-brand-50 text-brand-700 font-medium'
            : 'text-gray-700 hover:bg-gray-50'
        )}
      >
        <FileText className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">{index.project} (root)</span>
      </Link>

      {/* Modules */}
      {index.modules.length > 0 && (
        <div className="mt-2">
          <p className="px-3 text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
            Modules
          </p>
          <div className="space-y-0.5">
            {index.modules.map((module) => {
              const moduleHref = `${editorBase}?module=${encodeURIComponent(module.name)}`
              const moduleActive = pathname === editorBase && false // handled by query param

              return (
                <Link
                  key={module.name}
                  href={moduleHref}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                    moduleActive
                      ? 'bg-brand-50 text-brand-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <Folder className="w-4 h-4 flex-shrink-0 text-gray-400" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{module.name}</p>
                    <p className="truncate text-xs text-gray-400">{module.path}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
