'use client'

import { useEffect, useRef } from 'react'

interface Props {
  chart: string
}

export function MermaidDiagram({ chart }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    if (!containerRef.current || !chart) return

    let cancelled = false

    import('mermaid').then((mermaid) => {
      if (cancelled) return

      mermaid.default.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      })

      const id = idRef.current
      mermaid.default.render(id, chart).then(({ svg }) => {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
        }
      }).catch(() => {
        // Render error state
        if (containerRef.current) {
          containerRef.current.innerHTML = `<pre style="color:#64748b;font-size:13px">${chart}</pre>`
        }
      })
    })

    return () => { cancelled = true }
  }, [chart])

  return <div ref={containerRef} className="mermaid-diagram" />
}
