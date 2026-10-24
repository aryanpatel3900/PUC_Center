import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BellRing,
  CalendarClock,
  AlertOctagon,
  History as HistoryIcon,
  ListChecks,
  Sparkles,
  Search,
  FileDown,
  Filter,
} from 'lucide-react'
import ReminderTable from '../components/ReminderTable'
import ReminderMessagePreview from '../components/ReminderMessagePreview'
import ConfirmDialog from '../components/ConfirmDialog'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { joinReminders, effectiveStatus, statusLabel } from '../utils/reminderUtils'
import { VEHICLE_TYPES, exportReminders, downloadCSV } from '../utils/excelUtils'
import { formatDate } from '../utils/dateUtils'

const TABS = [
  { key: 'today', label: "Today's Due", icon: BellRing },
  { key: '30', label: '30-Day', icon: CalendarClock },
  { key: '15', label: '15-Day', icon: CalendarClock },
  { key: '7', label: '7-Day', icon: CalendarClock },
  { key: 'missed', label: 'Missed', icon: AlertOctagon },
  { key: 'sent', label: 'Sent History', icon: HistoryIcon },
  { key: 'all', label: 'All Reminders', icon: ListChecks },
]

const STATUSES = [
  { key: 'all', label: 'All statuses' },
  { key: 'due_today', label: 'Due Today' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'missed', label: 'Missed' },
  { key: 'sent', label: 'Sent — Confirmed' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'cancelled', label: 'Cancelled' },
]

/** Reminder Center with interval tabs, filters and the manual send workflow. */
export default function ReminderCenter() {
  const { customers, reminders, today, settings, addActivity, markReminderSent, skipReminder, resetReminder, recordWhatsAppOpen } = useData()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [previewRow, setPreviewRow] = useState(null)
  const [confirmMark, setConfirmMark] = useState(null)
  const [confirmReset, setConfirmReset] = useState(null)
  const [query, setQuery] = useState('')

  const tab = params.get('tab') || settings.defaultReminderTab || 'today'
  const statusFilter = params.get('status') || 'all'
  const typeFilter = params.get('type') || 'all'
  const sort = params.get('sort') || 'date'

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value && value !== 'all') next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const joined = useMemo(() => joinReminders(reminders, customers, today), [reminders, customers, today])

  const rows = useMemo(() => {
    let list = joined

    if (tab === 'today') list = list.filter((r) => r.state === 'due_today')
    else if (tab === 'missed') list = list.filter((r) => r.state === 'missed')
    else if (tab === 'sent') list = list.filter((r) => r.state === 'sent')
    else if (tab === '30' || tab === '15' || tab === '7') list = list.filter((r) => r.interval === Number(tab))
    // 'all' keeps everything

    if (statusFilter !== 'all') list = list.filter((r) => r.state === statusFilter)
    if (typeFilter !== 'all') list = list.filter((r) => r.customer.vehicleType === typeFilter)
    if (query.trim()) {
      const needle = query.trim().toLowerCase()
      list = list.filter((r) => `${r.customer.name} ${r.customer.mobile} ${r.customer.vehicleNumber}`.toLowerCase().includes(needle))
    }

    return [...list].sort((a, b) => {
      if (sort === 'name') return a.customer.name.localeCompare(b.customer.name)
      if (sort === 'vehicle') return a.customer.vehicleNumber.localeCompare(b.customer.vehicleNumber)
      if (a.scheduledDate === b.scheduledDate) return a.customer.name.localeCompare(b.customer.name)
      return a.scheduledDate < b.scheduledDate ? -1 : 1
    })
  }, [joined, tab, statusFilter, typeFilter, query, sort])

  const prepareToday = () => {
    const due = joined.filter((r) => r.state === 'due_today')
    addActivity('reminder_prepared', `Prepared ${due.length} reminder(s) due today (owner must open each WhatsApp chat individually)`)
    setParams(new URLSearchParams({ tab: 'today' }), { replace: true })
    if (due.length) {
      toast.success(`${due.length} reminder(s) ready for today. Open each WhatsApp chat one by one — nothing is sent automatically.`)
    } else {
      toast.info('No reminders are due today.')
    }
  }

  const quickOpenWhatsApp = (row) => {
    setPreviewRow(row) // Always go through the preview so the owner can review/edit.
  }

  const exportCurrent = () => {
    exportReminders(rows, today, `puc-reminders-${tab}.xlsx`)
    toast.success(`Exported ${rows.length} reminder record(s) to Excel.`)
  }

  const exportCSV = () => {
    const head = ['Customer', 'Mobile', 'Vehicle', 'Expiry', 'Interval', 'Scheduled', 'Status', 'Confirmed At']
    const body = rows.map((r) => [
      r.customer.name,
      r.customer.mobile,
      r.customer.vehicleNumber,
      formatDate(r.cycleExpiry),
      r.interval,
      formatDate(r.scheduledDate),
      statusLabel(r.state),
      r.confirmedAt ? new Date(r.confirmedAt).toLocaleString('en-GB') : '',
    ])
    downloadCSV([head, ...body], `puc-reminders-${tab}.csv`)
    toast.success('CSV downloaded.')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-800">Reminder Center</h1>
          <p className="text-sm text-slate-500">
            Reminders are prepared one at a time — the app never sends messages automatically. You open WhatsApp and press Send yourself.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={prepareToday}
            className="inline-flex items-center gap-1.5 rounded-xl bg-tealx-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-tealx-700"
          >
            <Sparkles className="h-4 w-4" /> Prepare Today's Reminders
          </button>
          <button
            onClick={exportCurrent}
            disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" /> Export Excel
          </button>
          <button
            onClick={exportCSV}
            disabled={!rows.length}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-card" role="tablist" aria-label="Reminder views">
        {TABS.map((t) => {
          const count =
            t.key === 'today'
              ? joined.filter((r) => r.state === 'due_today').length
              : t.key === 'missed'
                ? joined.filter((r) => r.state === 'missed').length
                : t.key === 'sent'
                  ? joined.filter((r) => r.state === 'sent').length
                  : t.key === 'all'
                    ? joined.length
                    : joined.filter((r) => r.interval === Number(t.key)).length
          const active = tab === t.key
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setParam('tab', t.key === (settings.defaultReminderTab || 'today') ? '' : t.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                active ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-navy-800'
              }`}
            >
              <t.icon className="h-4 w-4" aria-hidden="true" />
              {t.label}
              <span className={`rounded-full px-1.5 text-[11px] font-bold ${active ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <label htmlFor="rem-search" className="sr-only">Search reminders</label>
            <input
              id="rem-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customer, mobile or vehicle…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label htmlFor="rem-status" className="sr-only">Status filter</label>
            <select
              id="rem-status"
              value={statusFilter}
              onChange={(e) => setParam('status', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-navy-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rem-type" className="sr-only">Vehicle type filter</label>
            <select
              id="rem-type"
              value={typeFilter}
              onChange={(e) => setParam('type', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-navy-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="all">All vehicle types</option>
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rem-sort" className="sr-only">Sort order</label>
            <select
              id="rem-sort"
              value={sort}
              onChange={(e) => setParam('sort', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-navy-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="date">Sort: Reminder date</option>
              <option value="name">Sort: Customer name</option>
              <option value="vehicle">Sort: Vehicle number</option>
            </select>
          </div>
        </div>
        {(statusFilter !== 'all' || typeFilter !== 'all' || query) && (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Filter className="h-4 w-4" aria-hidden="true" /> Filtered view — showing {rows.length} reminder(s).
          </p>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <ReminderTable
          rows={rows}
          today={today}
          onPreview={(r) => setPreviewRow(r)}
          onOpenWhatsApp={quickOpenWhatsApp}
          onMarkSent={(r) => setConfirmMark(r)}
          onPrepareAgain={(r) => setConfirmReset(r)}
          onSkip={(r) => {
            skipReminder(r.id)
            toast.info(`The ${r.interval}-day reminder for ${r.customer.vehicleNumber} was skipped.`)
          }}
          emptyTitle={TABS.find((t) => t.key === tab)?.label || 'No reminders'}
          emptyDescription="Nothing matches this view right now."
        />
      </div>

      {/* Catch-up note for missed reminders */}
      {tab === 'missed' && rows.length ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Missed reminders:</strong> these scheduled dates have passed without confirmation. Use “Prepare again” to reset a reminder
          and send it late, or “Skip” if you do not want to send it. The app will ask you to confirm each action.
        </p>
      ) : null}

      <ReminderMessagePreview record={previewRow} open={Boolean(previewRow)} onClose={() => setPreviewRow(null)} />

      <ConfirmDialog
        open={Boolean(confirmMark)}
        onClose={() => setConfirmMark(null)}
        onConfirm={() => {
          markReminderSent(confirmMark.id)
          toast.success(`${confirmMark.interval}-day reminder for ${confirmMark.customer.vehicleNumber} marked as sent.`)
          setConfirmMark(null)
        }}
        title="Confirm the message was sent?"
        message={
          confirmMark ? (
            <p>
              Mark the {confirmMark.interval}-day reminder for <strong>{confirmMark.customer.vehicleNumber}</strong> as{' '}
              <strong>Sent — Confirmed by Owner</strong>? Only do this after you actually pressed Send in WhatsApp. The app cannot verify
              delivery itself.
            </p>
          ) : null
        }
        confirmLabel="Yes, I sent it"
      />

      <ConfirmDialog
        open={Boolean(confirmReset)}
        onClose={() => setConfirmReset(null)}
        onConfirm={() => {
          resetReminder(confirmReset.id)
          toast.success(`Reminder for ${confirmReset.customer.vehicleNumber} is ready to prepare again.`)
          setConfirmReset(null)
        }}
        title="Prepare this missed reminder again?"
        message={
          confirmReset ? (
            <p>
              The {confirmReset.interval}-day reminder for <strong>{confirmReset.customer.vehicleNumber}</strong> will be reset to pending so
              you can open WhatsApp and send it late. Any previous confirmation on this reminder will be cleared.
            </p>
          ) : null
        }
        confirmLabel="Reset to pending"
      />
    </div>
  )
}
