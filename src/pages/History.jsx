import { useMemo, useState } from 'react'
import { History as HistoryIcon, Search, FileDown, Download } from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import Pagination from '../components/Pagination'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { joinReminders, statusLabel, STATUS_META } from '../utils/reminderUtils'
import { exportReminders, downloadCSV } from '../utils/excelUtils'
import { formatDate } from '../utils/dateUtils'

const FILTERS = [
  { key: 'all', label: 'All reminders' },
  { key: 'sent', label: 'Sent' },
  { key: 'pending', label: 'Pending (scheduled / due / missed)' },
  { key: 'missed', label: 'Missed' },
  { key: 'cancelled', label: 'Cancelled / Skipped' },
]

/** Full reminder history with duplicate-protection audit trail. */
export default function History() {
  const { reminders, customers, today, settings } = useData()
  const toast = useToast()
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = settings.pageSize || 25

  const joined = useMemo(() => joinReminders(reminders, customers, today), [reminders, customers, today])

  const rows = useMemo(() => {
    let list = joined
    if (filter === 'sent') list = list.filter((r) => r.state === 'sent')
    else if (filter === 'missed') list = list.filter((r) => r.state === 'missed')
    else if (filter === 'pending') list = list.filter((r) => ['scheduled', 'due_today'].includes(r.state))
    else if (filter === 'cancelled') list = list.filter((r) => ['cancelled', 'skipped'].includes(r.state))
    if (query.trim()) {
      const needle = query.trim().toLowerCase()
      list = list.filter((r) => `${r.customer.name} ${r.customer.mobile} ${r.customer.vehicleNumber}`.toLowerCase().includes(needle))
    }
    return [...list].sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1))
  }, [joined, filter, query])

  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pages)
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-navy-800">
            <HistoryIcon className="h-6 w-6 text-brand-600" aria-hidden="true" /> Reminder History
          </h1>
          <p className="text-sm text-slate-500">
            Every reminder is tracked independently per vehicle, expiry cycle and interval (30 / 15 / 7 days). Duplicates are prevented
            automatically; each record below is unique.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              exportReminders(rows, today, 'puc-reminder-history.xlsx')
              toast.success(`Exported ${rows.length} history record(s).`)
            }}
            disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" /> Export Excel
          </button>
          <button
            onClick={() => {
              const head = ['Customer', 'Mobile', 'Vehicle', 'Cycle Expiry', 'Interval', 'Scheduled', 'Status', 'WhatsApp Opened', 'Confirmed Sent', 'Notes']
              const body = rows.map((r) => [
                r.customer.name,
                r.customer.mobile,
                r.customer.vehicleNumber,
                formatDate(r.cycleExpiry),
                r.interval,
                formatDate(r.scheduledDate),
                statusLabel(r.state),
                r.openedAt ? new Date(r.openedAt).toLocaleString('en-GB') : '',
                r.confirmedAt ? new Date(r.confirmedAt).toLocaleString('en-GB') : '',
                r.notes || '',
              ])
              downloadCSV([head, ...body], 'puc-reminder-history.csv')
              toast.success('History CSV downloaded.')
            }}
            disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <label htmlFor="hist-search" className="sr-only">Search history</label>
            <input
              id="hist-search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Search customer, mobile or vehicle…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setFilter(f.key)
                  setPage(1)
                }}
                className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                  filter === f.key ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        {rows.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Vehicle</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Cycle Expiry</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Interval</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Scheduled</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-3 font-semibold">WhatsApp Opened</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Confirmed Sent</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((r) => {
                    const meta = STATUS_META[r.state] || STATUS_META.scheduled
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-semibold text-navy-800">{r.customer.name}</td>
                        <td className="px-4 py-3 font-mono text-[13px] text-navy-700">{r.customer.vehicleNumber}</td>
                        <td className="whitespace-nowrap px-4 py-3">{formatDate(r.cycleExpiry)}</td>
                        <td className="whitespace-nowrap px-4 py-3">{r.interval} days</td>
                        <td className="whitespace-nowrap px-4 py-3">{formatDate(r.scheduledDate)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{r.openedAt ? new Date(r.openedAt).toLocaleString('en-GB') : '—'}</td>
                        <td className="px-4 py-3 text-slate-500">{r.confirmedAt ? new Date(r.confirmedAt).toLocaleString('en-GB') : '—'}</td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-xs text-slate-400" title={r.notes || ''}>
                          {r.notes || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={safePage} pageSize={pageSize} total={rows.length} onPage={setPage} />
          </>
        ) : (
          <EmptyState
            icon={HistoryIcon}
            title="No reminder history yet"
            description="Reminder records are created automatically for every customer. Import your customers first."
          />
        )}
      </div>
    </div>
  )
}
