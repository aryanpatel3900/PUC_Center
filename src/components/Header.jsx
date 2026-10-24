import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, Search, Bell, Settings, Users } from 'lucide-react'
import { useData } from '../context/DataContext'
import { dueToday, missedReminders } from '../utils/reminderUtils'

/** Top bar: menu toggle, global search, notifications and settings. */
export default function Header({ onOpenMobile }) {
  const { customers, reminders, today, settings, storageWarning } = useData()
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  const due = dueToday(reminders, today).length
  const missed = missedReminders(reminders, today).length
  const alerts = due + missed

  const submit = (e) => {
    e.preventDefault()
    navigate(`/customers?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <button
          onClick={onOpenMobile}
          className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <form onSubmit={submit} className="relative min-w-0 flex-1 sm:max-w-md" role="search">
          <label htmlFor="global-search" className="sr-only">
            Search customers
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id="global-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, mobile or vehicle…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-navy-800 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </form>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            to="/reminders?tab=today"
            className="relative rounded-xl p-2 text-slate-600 transition hover:bg-slate-100"
            aria-label={`Notifications: ${alerts} reminders need attention`}
            title="Reminders needing attention"
          >
            <Bell className="h-5 w-5" />
            {alerts > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {alerts > 99 ? '99+' : alerts}
              </span>
            ) : null}
          </Link>

          <Link
            to="/settings"
            className="hidden rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 sm:block"
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </Link>

          <div className="ml-1 hidden items-center gap-2.5 rounded-xl border border-slate-200 py-1.5 pl-1.5 pr-3 md:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-tealx-600 text-white">
              <Users className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="max-w-[180px] leading-tight">
              <p className="truncate text-xs font-semibold text-navy-800">{settings.centerName || 'PUC Center'}</p>
              <p className="truncate text-[11px] text-slate-500">{customers.length} customers</p>
            </div>
          </div>
        </div>
      </div>

      {storageWarning ? (
        <div className="bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800 sm:px-6">
          Warning: browser storage is full or blocked. Changes may not be saved — download a JSON backup from Settings immediately.
        </div>
      ) : null}
    </header>
  )
}
