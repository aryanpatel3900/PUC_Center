import { Link } from 'react-router-dom'

const ACCENTS = {
  blue: { icon: 'bg-blue-50 text-blue-600', bar: 'bg-blue-500' },
  teal: { icon: 'bg-tealx-50 text-tealx-600', bar: 'bg-tealx-500' },
  green: { icon: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
  amber: { icon: 'bg-amber-50 text-amber-600', bar: 'bg-amber-500' },
  red: { icon: 'bg-red-50 text-red-600', bar: 'bg-red-500' },
  purple: { icon: 'bg-violet-50 text-violet-600', bar: 'bg-violet-500' },
  slate: { icon: 'bg-slate-100 text-slate-600', bar: 'bg-slate-500' },
}

/**
 * Dashboard statistic card. Clicking navigates to the matching filtered list.
 */
export default function StatCard({ to, label, value, icon: Icon, accent = 'blue', hint }) {
  const a = ACCENTS[accent] || ACCENTS.blue
  const content = (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition hover:shadow-card-hover focus-within:shadow-card-hover sm:p-5">
      <span className={`absolute inset-x-0 top-0 h-1 ${a.bar}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">{value}</p>
          {hint ? <p className="mt-1 truncate text-xs text-slate-400">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className={`rounded-xl p-2.5 ${a.icon}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        ) : null}
      </div>
    </div>
  )

  if (to) {
    return (
      <Link to={to} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-2xl">
        {content}
      </Link>
    )
  }
  return content
}
