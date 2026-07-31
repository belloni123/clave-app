'use client'

import { CircleHelp } from 'lucide-react'
import { useState } from 'react'

export type SourceGrade = 'S' | 'C' | 'P' | 'O'

const GRADE_LABELS: Record<SourceGrade, string> = {
  S: 'Fonte clássica rastreável',
  C: 'Convenção de mercado',
  P: 'Definição pendente',
  O: 'Organização própria do Clave',
}
const GRADE_CLASSES: Record<SourceGrade, string> = {
  S: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  C: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  P: 'border-red-500/30 bg-red-500/10 text-red-400',
  O: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
}

interface SourceCreditProps {
  grade: SourceGrade
  source: string
  className?: string
}

export default function SourceCredit({ grade, source, className = '' }: SourceCreditProps) {
  const [open, setOpen] = useState(false)

  return (
    <span className={`relative inline-flex items-center gap-1 ${className}`}>
      <span
        className={`inline-flex items-center rounded border px-1 py-0.5 text-[8px] font-bold leading-none ${GRADE_CLASSES[grade]}`}
        title={GRADE_LABELS[grade]}
      >
        [{grade}]
      </span>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Ver fonte: ${source}`}
        aria-expanded={open}
        className="inline-flex h-4 w-4 items-center justify-center rounded text-text3 transition-colors hover:bg-surface2 hover:text-text-custom focus:outline-none focus:ring-1 focus:ring-text-custom"
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="dialog"
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-border2 bg-surface p-3 text-left text-[10px] leading-relaxed text-text2 shadow-xl"
        >
          <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-text3">
            {GRADE_LABELS[grade]}
          </span>
          <span className="block text-text-custom">{source}</span>
        </span>
      )}
    </span>
  )
}
