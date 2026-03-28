'use client'

/**
 * MermaidDiagram renders Mermaid diagram source code in a readable code block.
 * When mermaid npm package is available and installed, this component can be
 * upgraded to render actual SVG diagrams via useEffect + mermaid.render().
 */
interface MermaidDiagramProps {
  title?: string
  code: string
  type?: string
}

export function MermaidDiagram({ title, code }: MermaidDiagramProps) {
  const editUrl = `https://mermaid.live/edit#base64:${btoa(unescape(encodeURIComponent(code)))}`

  return (
    <div className="diagram-card">
      {title && <div className="diagram-card__title">📊 {title}</div>}
      <div className="diagram-card__content">
        <pre style={{
          background: '#0f172a',
          color: '#e2e8f0',
          padding: '12px',
          borderRadius: '8px',
          overflow: 'auto',
          fontSize: '12px',
          lineHeight: 1.6,
          margin: 0,
        }}>
          <code>{code}</code>
        </pre>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <a
            href={editUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn ghost"
            style={{ fontSize: 12 }}
          >
            🔗 Open in Mermaid Live Editor
          </a>
        </div>
      </div>
    </div>
  )
}

interface DiagramListProps {
  diagrams: Array<{ title: string; type: string; code: string }>
}

export function DiagramList({ diagrams }: DiagramListProps) {
  if (!diagrams || diagrams.length === 0) {
    return <p className="muted" style={{ fontSize: 13 }}>No diagrams generated for this revision.</p>
  }
  return (
    <div>
      {diagrams.map((d, i) => (
        <MermaidDiagram key={i} title={d.title} code={d.code} type={d.type} />
      ))}
    </div>
  )
}
