const TONES = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  muted: 'bg-slate-100 text-slate-600 border-slate-200',
}

/**
 * Status pill. Colour is never the only signal — the label text always
 * describes the status in words.
 */
export default function StatusBadge({ tone = 'info', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone] || TONES.info} ${className}`}
    >
      {children}
    </span>
  )
}
