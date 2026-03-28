'use client'

interface Props {
  versions: number[]
  active: number
  onSelect: (version: number) => void
}

export function RevisionSelector({ versions, active, onSelect }: Props) {
  if (versions.length === 0) return null

  return (
    <div className="revision-selector">
      {versions.map((v) => (
        <button
          key={v}
          className={`revision-selector__pill ${v === active ? 'revision-selector__pill--active' : ''}`}
          onClick={() => onSelect(v)}
        >
          v{v}
        </button>
      ))}
    </div>
  )
}
