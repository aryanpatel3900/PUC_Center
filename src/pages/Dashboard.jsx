import { Link } from 'react-router-dom'
import {
  Users,
  CarFront,
  BellRing,
  AlertOctagon,
  Timer,
  CheckCheck,
  CalendarClock,
  Upload,
  FileDown,
  DatabaseBackup,
  History,
  TrendingUp,
} from 'lucide-react'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import CustomerForm from '../components/CustomerForm'
import EmptyState from '../components/EmptyState'
import ReminderMessagePreview from '../components/ReminderMessagePreview'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { useState } from 'react'
import { computeStats, joinReminders, dueToday, STATUS_META } from '../utils/reminderUtils'
import { compareISO, diffDays, formatDate } from '../utils/dateUtils'
import { openWhatsApp } from '../utils/whatsappUtils'
import { exportCustomers, downloadTemplate } from '../utils/excelUtils'

/** Dashboard: real statistics plus today's reminders and upcoming expiries. */
export default function Dashboard() {
  const { customers, reminders, today, fmtDate, settings, backupNow, recordWhatsAppOpen, activity } = useData()
  const toast = useToast()
  const [addOpen, setAddOpen] = useState(false)
  const [previewRow, setPreviewRow] = useState(null)

  const stats = computeStats(customers, reminders, today)
  const joined = joinReminders(reminders, customers, today)
  const dueRows = joined.filter((r) => r.state === 'due_today')
  const missedRows = joined.filter((r) => r.state === 'missed')
  const recent = activity.slice(0, 8)

  const upcoming = [...customers]
    .filter((c) => compareISO(c.pucExpiryDate, today) >= 0)
    .sort((a, b) => (a.pucExpiryDate < b.pucExpiryDate ? -1 : 1))
    .slice(0, 6)

  const quickOpen = (row) => {
    const message =
      row.message ||
      `નમસ્તે ${row.customer.name}, આપના વાહન ${row.customer.vehicleNumber} ની PUC મુદ્દત ${formatDate(row.cycleExpiry)} ના રોજ સમાપ્ત થવાની છે. કૃપા કરીને વહેલી તકે PUC નવીનીકરણ કરાવો. - ${settings.centerName}`
    const res = openWhatsApp(row.customer.mobile, message)
    if (res.ok) {
      recordWhatsAppOpen(row.id, message)
      toast.success('WhatsApp opened — press Send inside WhatsApp, then come back and mark it sent.')
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-800">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {settings.centerName} — today is {fmtDate(today)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <Users className="h-4 w-4" /> Add Customer
          </button>
          <Link
            to="/reminders?tab=today"
            className="inline-flex items-center gap-1.5 rounded-xl bg-tealx-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-tealx-700"
          >
            <BellRing className="h-4 w-4" /> Reminder Center
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard to="/customers" label="Total Customers" value={stats.totalCustomers} icon={Users} accent="blue" />
        <StatCard to="/customers" label="Total Vehicles" value={stats.totalVehicles} icon={CarFront} accent="teal" />
        <StatCard to="/reminders?tab=today" label="Reminders Due Today" value={stats.dueToday} icon={BellRing} accent="amber" />
        <StatCard to="/reminders?tab=30" label="30-Day Due" value={stats.due30} icon={CalendarClock} accent="purple" />
        <StatCard to="/reminders?tab=15" label="15-Day Due" value={stats.due15} icon={CalendarClock} accent="blue" />
        <StatCard to="/reminders?tab=7" label="7-Day Due" value={stats.due7} icon={Timer} accent="amber" />
        <StatCard to="/customers?filter=expired" label="Expired PUC" value={stats.expired} icon={AlertOctagon} accent="red" />
        <StatCard to="/reminders?tab=sent" label="Sent Today" value={stats.sentToday} icon={CheckCheck} accent="green" />
        <StatCard to="/reminders?tab=all" label="Pending Reminders" value={stats.pending} icon={History} accent="teal" />
        <StatCard to="/reminders?tab=missed" label="Missed Reminders" value={stats.missed} icon={AlertOctagon} accent="red" />
      </div>

      {/* Quick actions */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <h2 className="text-sm font-semibold text-navy-800">Quick Actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/import" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:border-brand-300 hover:bg-brand-50">
            <Upload className="h-4 w-4" /> Import Excel
          </Link>
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:border-brand-300 hover:bg-brand-50">
            <Users className="h-4 w-4" /> Add Customer
          </button>
          <Link to="/reminders?tab=today" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:border-brand-300 hover:bg-brand-50">
            <BellRing className="h-4 w-4" /> Today's Reminders
          </Link>
          <button
            onClick={() => {
              exportCustomers(customers, reminders, today, 'puc-customers.xlsx')
              toast.success('Customers exported to Excel.')
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:border-brand-300 hover:bg-brand-50"
          >
            <FileDown className="h-4 w-4" /> Export Customers
          </button>
          <button
            onClick={() => {
              backupNow()
              toast.success('JSON backup downloaded.')
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:border-brand-300 hover:bg-brand-50"
          >
            <DatabaseBackup className="h-4 w-4" /> Backup Data
          </button>
          <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:border-brand-300 hover:bg-brand-50">
            <TrendingUp className="h-4 w-4" /> Excel Template
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Today's reminders */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-navy-800">Today's Reminders</h2>
            <Link to="/reminders?tab=today" className="text-sm font-medium text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          {dueRows.length ? (
            <ul className="divide-y divide-slate-100">
              {dueRows.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy-800">{r.customer.name}</p>
                    <p className="text-xs text-slate-500">
                      <span className="font-mono">{r.customer.vehicleNumber}</span> · {r.interval}-day · expires {formatDate(r.cycleExpiry)}
                    </p>
                  </div>
                  <StatusBadge tone={STATUS_META[r.state].tone}>{STATUS_META[r.state].label}</StatusBadge>
                  <button
                    onClick={() => quickOpen(r)}
                    className="rounded-lg bg-whatsapp-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-whatsapp-700"
                  >
                    WhatsApp
                  </button>
                  <button onClick={() => setPreviewRow(r)} className="text-xs font-medium text-brand-700 hover:underline">
                    Mark sent
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No reminders due today" description="Everything is up to date for today." />
          )}
        </section>

        {/* Upcoming expiries */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-navy-800">Upcoming Expiries</h2>
            <Link to="/customers?filter=expiring" className="text-sm font-medium text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          {upcoming.length ? (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((c) => {
                const days = diffDays(today, c.pucExpiryDate)
                return (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy-800">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{c.vehicleNumber}</span> · {c.vehicleType}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-navy-800">{formatDate(c.pucExpiryDate)}</p>
                      <p className="text-xs text-slate-500">{days === 0 ? 'today' : `${days} days left`}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState title="No upcoming expiries" description="Add customers or import an Excel file to see expiries here." />
          )}
        </section>

        {/* Missed reminders */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-navy-800">Missed Reminders</h2>
            <Link to="/reminders?tab=missed" className="text-sm font-medium text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          {missedRows.length ? (
            <ul className="divide-y divide-slate-100">
              {missedRows.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy-800">{r.customer.name}</p>
                    <p className="text-xs text-slate-500">
                      <span className="font-mono">{r.customer.vehicleNumber}</span> · {r.interval}-day was due {formatDate(r.scheduledDate)}
                    </p>
                  </div>
                  <button onClick={() => setPreviewRow(r)} className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                    Prepare now
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No missed reminders" description="All reminders so far have been handled." />
          )}
        </section>

        {/* Recent activity */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-navy-800">Recent Activity</h2>
          </div>
          {recent.length ? (
            <ul className="max-h-[320px] divide-y divide-slate-100 overflow-y-auto">
              {recent.map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <p className="text-sm text-navy-800">{a.text}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{new Date(a.at).toLocaleString('en-GB')}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No activity yet" description="Imports, edits and reminders will appear here." />
          )}
        </section>
      </div>

      <CustomerForm open={addOpen} onClose={() => setAddOpen(false)} />
      <ReminderMessagePreview record={previewRow} open={Boolean(previewRow)} onClose={() => setPreviewRow(null)} />
    </div>
  )
}
