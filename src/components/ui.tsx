import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export function IconButton({
  children,
  className = '',
  active,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button type="button" className={`icon-btn ${active ? 'is-active' : ''} ${className}`} {...rest}>
      {children}
    </button>
  )
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Sheet({
  open,
  onClose,
  children,
  className = '',
  label,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  label: string
}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const node = sheetRef.current
    const focusables = () =>
      node
        ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => el.getClientRects().length > 0,
          )
        : []

    if (node && !node.contains(document.activeElement)) {
      const first = focusables()[0]
      if (first) first.focus()
      else node.focus()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) {
        e.preventDefault()
        node?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      // Only hand focus back if the sheet is still the thing that had it.
      if (returnTo && document.contains(returnTo)) returnTo.focus()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`sheet ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={sheetRef}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      className={`switch ${checked ? 'is-on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

/** Flowrite-style syllable glyph: dots, triangles or hexagons for 1–12. */
export function SyllableGlyph({ count, active = false }: { count: number; active?: boolean }) {
  const n = Math.max(0, Math.min(12, count))
  if (!n) return <span className="syl-glyph empty" aria-hidden />
  const positions: [number, number][] = []
  const cols = n <= 4 ? 1 : n <= 8 ? 2 : 3
  const rows = Math.ceil(n / cols)
  for (let i = 0; i < n; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    positions.push([col * 5.5, row * 5.5 + (cols === 2 ? (i % 2) * 0.8 : 0)])
  }
  const shapes = n <= 4 ? 'circle' : n <= 8 ? 'triangle' : 'hex'
  const size = 3.1
  const width = (cols - 1) * 5.5 + size + 1
  const height = (rows - 1) * 5.5 + size + 1
  return (
    <svg
      className={`syl-glyph ${active ? 'is-active' : ''}`}
      width={Math.max(width, 4)}
      height={Math.max(height, 4)}
      viewBox={`0 0 ${Math.max(width, 4)} ${Math.max(height, 4)}`}
      aria-hidden
    >
      {positions.map(([x, y], i) => {
        const cx = x + 0.6
        const cy = y + 0.6
        if (shapes === 'circle') return <circle key={i} cx={cx} cy={cy} r={size / 2} />
        if (shapes === 'triangle')
          return (
            <polygon
              key={i}
              points={`${cx},${cy - size / 1.6} ${cx + size / 1.5},${cy + size / 2} ${cx - size / 1.5},${cy + size / 2}`}
            />
          )
        return (
          <polygon
            key={i}
            points={[0, 1, 2, 3, 4, 5]
              .map((k) => {
                const a = (Math.PI / 3) * k - Math.PI / 2
                return `${cx + (size / 1.9) * Math.cos(a)},${cy + (size / 1.9) * Math.sin(a)}`
              })
              .join(' ')}
          />
        )
      })}
    </svg>
  )
}

export function WaveMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 18" className={`wave-mark ${className}`} aria-hidden>
      <path d="M0 7.5c4.8-6.6 9.6-6.6 14.4 0s9.6 6.6 14.4 0v5.2c-4.8 6.6-9.6 6.6-14.4 0S4.8 6.1 0 12.7z" />
    </svg>
  )
}
