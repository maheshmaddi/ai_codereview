'use client'

import { useEffect, useRef } from 'react'

interface SSELogProps {
  lines: Array<{ type: string; message: string }>
}

export function SSELog({ lines }: SSELogProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [lines])

  if (lines.length === 0) return null

  return (
    <div className="sse-log" ref={ref}>
      {lines.map((l, i) => (
        <div
          key={i}
          className={`sse-log__line sse-log__line--${l.type}`}
        >
          {l.message}
        </div>
      ))}
    </div>
  )
}
