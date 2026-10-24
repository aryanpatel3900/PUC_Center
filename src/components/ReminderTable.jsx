import { MessageCircle, CheckCheck, Eye, RotateCcw, SkipForward } from 'lucide-react'
import StatusBadge from './StatusBadge'
import EmptyState from './EmptyState'
import { formatDate } from '../utils/dateUtils'
import { formatMobile, isValidIndianMobile } from '../utils/phoneUtils'
import { statusLabel, STATUS_META } from '../utils/reminderUtils'

/**
 * Reminder list table used by the Reminder Center, Missed Reminders and
 * Sent History views. Every row shows a WhatsApp button and a separate
 * "Mark as Sent" button — opening WhatsApp never marks a reminder sent.
 */
export default function ReminderTable({ rows, today, onPreview, onOpenWhatsApp, onMarkSent, onPrepareAgain, onSkip, emptyTitle = 'No reminders', emptyDescription }) {
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
            <th scope="col" className="px-4 py-3 font-semibold">Vehicle</th>
            <th scope="col" className="px-4 py-3 font-semibold">Mobile</th>
            <th scope="col" className="px-4 py-3 font-semibold">PUC Expiry</th>
            <th scope="col" className="px-4 py-3 font-semibold">Interval</th>
            <th scope="col" className="px-4 py-3 font-semibold">Reminder Date</th>
            <th scope="col" className="px-4 py-3 font-semibold">Status</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const meta = STATUS_META[r.state] || STATUS_META.scheduled
            const phoneOk = isValidIndianMobile(r.customer.mobile)
            const final = r.state === 'sent' || r.state === 'cancelled' || r.state === 'skipped'
            return (
              <tr key={r.id} className={`transition hover:bg-slate-50/70 ${r.state === 'due_today' ? 'bg-amber-50/40' : ''}`}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-navy-800">{r.customer.name}</p>
                  {r.openedAt && r.state !== 'sent' ? (
                    <p className="text-xs text-amber-600">WhatsApp opened — not confirmed</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <p className="font-mono text-[13px] font-semibold text-navy-700">{r.customer.vehicleNumber}</p>
                  <p className="text-xs text-slate-400">{r.customer.vehicleType}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={phoneOk ? 'text-slate-600' : 'font-medium text-red-600'} title={phoneOk ? '' : 'Invalid mobile number'}>
                    {phoneOk ? formatMobile(r.customer.mobile) : r.customer.mobile || 'Invalid'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-navy-800">{formatDate(r.cycleExpiry)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <StatusBadge tone={r.interval === 7 ? 'warning' : r.interval === 15 ? 'info' : 'muted'}>{r.interval} days</StatusBadge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-navy-800">{formatDate(r.scheduledDate)}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                  {r.confirmedAt ? <p className="mt-0.5 text-xs text-slate-400">{new Date(r.confirmedAt).toLocaleString('en-GB')}</p> : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onPreview(r)}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-navy-800"
                      aria-label={`Preview message for ${r.customer.name}`}
                      title="Preview / edit message"
                    >
                      <Eye className="h-4 w-4" />
                    </button>

                    <button
                      onClick={() => onOpenWhatsApp(r)}
                      disabled={!phoneOk}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-whatsapp-600 px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-whatsapp-700 disabled:cursor-not-allowed disabled:opacity-40"
                      title={phoneOk ? 'Open WhatsApp with prefilled message (you press Send yourself)' : 'Invalid mobile number — fix it first'}
                    >
                      <MessageCircle className="h-4 w-4" /> <span className="hidden sm:inline">WhatsApp</span>
                    </button>

                    {r.state === 'missed' ? (
                      <button
                        onClick={() => onPrepareAgain(r)}
                        className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-700 transition hover:bg-amber-100"
                        aria-label={`Prepare the missed ${r.interval}-day reminder again`}
                        title="Prepare this missed reminder again"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    ) : null}

                    <button
                      onClick={() => onMarkSent(r)}
                      disabled={r.state === 'sent'}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Confirm that you have actually sent this message"
                    >
                      <CheckCheck className="h-4 w-4" /> <span className="hidden md:inline">Mark Sent</span>
                    </button>

                    {!final ? (
                      <button
                        onClick={() => onSkip(r)}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                        aria-label={`Skip the ${r.interval}-day reminder for ${r.customer.name}`}
                        title="Skip this reminder"
                      >
                        <SkipForward className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
