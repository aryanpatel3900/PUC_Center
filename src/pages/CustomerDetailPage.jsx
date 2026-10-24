import { useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Pencil,
  MessageCircle,
  FileDown,
  CalendarClock,
  Phone,
  CarFront,
  MapPin,
  Clock,
  Trash2,
} from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import CustomerForm from '../components/CustomerForm'
import ReminderMessagePreview from '../components/ReminderMessagePreview'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { formatDate, diffDays } from '../utils/dateUtils'
import { formatMobile, isValidIndianMobile } from '../utils/phoneUtils'
import { expiryStatus, EXPIRY_META, effectiveStatus, statusLabel, STATUS_META, remindersForCustomer } from '../utils/reminderUtils'
import { exportCustomers } from '../utils/excelUtils'
import { buildMessage } from '../utils/messageTemplates'
import { openWhatsApp } from '../utils/whatsappUtils'

/** Full customer detail page with reminder timeline and history. */
export default function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getCustomer, reminders, customers, today, settings, fmtDate, deleteCustomer, recordWhatsAppOpen } = useData()
  const toast = useToast()
  const [editOpen, setEditOpen] = useState(false)
  const [previewRow, setPreviewRow] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const customer = getCustomer(id)
  const history = useMemo(() => (customer ? remindersForCustomer(reminders, customer.id) : []), [reminders, customer])

  if (!customer) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white shadow-card">
        <EmptyState
          title="Customer not found"
          description="This customer may have been deleted."
          action={
            <Link to="/customers" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              Back to Customers
            </Link>
          }
        />
      </div>
    )
  }

  const days = diffDays(today, customer.pucExpiryDate)
  const st = expiryStatus(customer, today)
  const meta = EXPIRY_META[st]
  const phoneOk = isValidIndianMobile(customer.mobile)

  // The nearest actionable reminder for the quick WhatsApp button.
  const actionable = history
    .filter((r) => ['due_today', 'missed', 'scheduled'].includes(effectiveStatus(r, today)))
    .sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : 1))[0]

  const quickWhatsApp = () => {
    if (!actionable) {
      toast.info('All reminders for this vehicle are already handled.')
      return
    }
    setPreviewRow(actionable)
  }

  const openDirect = () => {
    if (!phoneOk) {
      toast.error('Invalid mobile number — edit the customer first.')
      return
    }
    if (!actionable) return
    const message = buildMessage({ interval: actionable.interval, customer, settings })
    const res = openWhatsApp(customer.mobile, message)
    if (res.ok) {
      recordWhatsAppOpen(actionable.id, message)
      toast.success('WhatsApp opened — press Send inside WhatsApp, then mark it as sent.')
    } else {
      toast.error(res.error)
    }
  }

  const current = history.filter((r) => r.cycleExpiry === customer.pucExpiryDate)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => exportCustomers([customer], reminders, today, `puc-${customer.vehicleNumber}.xlsx`)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50"
          >
            <FileDown className="h-4 w-4" /> Export
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
          <button
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <Pencil className="h-4 w-4" /> Edit Customer
          </button>
        </div>
      </div>

      {/* Profile card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-navy-800">{customer.name}</h1>
              <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
              {customer.isSample ? <StatusBadge tone="muted">Sample record</StatusBadge> : null}
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span className={phoneOk ? '' : 'font-medium text-red-600'}>
                  {phoneOk ? formatMobile(customer.mobile) : `${customer.mobile || '(empty)'} — invalid`}
                </span>
              </p>
              <p className="flex items-center gap-2">
                <CarFront className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span className="font-mono font-semibold text-navy-700">{customer.vehicleNumber}</span> · {customer.vehicleType}
              </p>
              {customer.address ? (
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-400" aria-hidden="true" /> {customer.address}
                </p>
              ) : null}
              {customer.email ? <p className="text-slate-500">{customer.email}</p> : null}
            </div>
          </div>

          {/* Expiry summary */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">PUC Expiry</p>
            <p className="mt-1 text-xl font-bold text-navy-800">{fmtDate(customer.pucExpiryDate)}</p>
            <p className={`mt-1 text-sm font-semibold ${days < 0 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {days < 0 ? `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago` : days === 0 ? 'Expires today' : `${days} day${days === 1 ? '' : 's'} remaining`}
            </p>
            <button
              onClick={quickWhatsApp}
              disabled={!phoneOk}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-whatsapp-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-whatsapp-700 disabled:cursor-not-allowed disabled:opacity-50"
              title={phoneOk ? 'Open WhatsApp with the next reminder message' : 'Invalid mobile number'}
            >
              <MessageCircle className="h-4 w-4" /> Open WhatsApp
            </button>
          </div>
        </div>
      </div>

      {/* Current cycle reminders */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <CalendarClock className="h-5 w-5 text-brand-600" aria-hidden="true" /> Reminder Schedule (current cycle)
          </h2>
          <p className="text-sm text-slate-500">Reminders are calculated automatically: 30, 15 and 7 days before the expiry date.</p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {current.length ? (
            [30, 15, 7].map((interval) => {
              const rec = current.find((r) => r.interval === interval)
              if (!rec) return null
              const state = effectiveStatus(rec, today)
              const stateMeta = STATUS_META[state]
              return (
                <div key={interval} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-navy-800">{interval}-Day Reminder</p>
                    <StatusBadge tone={stateMeta.tone}>{stateMeta.label}</StatusBadge>
                  </div>
                  <p className="mt-2 text-lg font-bold text-navy-800">{fmtDate(rec.scheduledDate)}</p>
                  {rec.confirmedAt ? (
                    <p className="mt-1 text-xs text-emerald-600">Confirmed sent {new Date(rec.confirmedAt).toLocaleString('en-GB')}</p>
                  ) : rec.openedAt ? (
                    <p className="mt-1 text-xs text-amber-600">WhatsApp opened — not confirmed yet</p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Not opened yet</p>
                  )}
                  <button
                    onClick={() => setPreviewRow(rec)}
                    className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 transition hover:bg-slate-50"
                  >
                    Open reminder
                  </button>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-slate-500">No reminders scheduled for the current expiry cycle.</p>
          )}
        </div>
      </section>

      {/* History */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-navy-800">Reminder History (all cycles)</h2>
        </div>
        {history.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-3 font-semibold">Interval</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Cycle Expiry</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Scheduled</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Confirmed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((r) => {
                  const state = effectiveStatus(r, today)
                  const stateMeta = STATUS_META[state]
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-medium text-navy-800">{r.interval} days</td>
                      <td className="px-4 py-3">{fmtDate(r.cycleExpiry)}</td>
                      <td className="px-4 py-3">{fmtDate(r.scheduledDate)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={stateMeta.tone}>{stateMeta.label}</StatusBadge>
                        {r.notes ? <p className="mt-0.5 text-xs text-slate-400">{r.notes}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{r.confirmedAt ? new Date(r.confirmedAt).toLocaleString('en-GB') : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No reminder history yet" description="Reminder records appear here once the schedule is calculated." />
        )}
      </section>

      <CustomerForm open={editOpen} onClose={() => setEditOpen(false)} customer={customer} />
      <ReminderMessagePreview record={previewRow} open={Boolean(previewRow)} onClose={() => setPreviewRow(null)} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteCustomer(customer.id)
          toast.success('Customer deleted.')
          navigate('/customers')
        }}
        title="Delete customer?"
        danger
        confirmLabel="Delete"
        message={`Delete ${customer.name} (${customer.vehicleNumber})? Past reminder history is kept for audit. This cannot be undone.`}
      />
    </div>
  )
}
