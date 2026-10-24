import { useEffect, useState } from 'react'
import { MessageCircle, CheckCheck, Copy, RefreshCw, Info, ShieldAlert } from 'lucide-react'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { buildMessage } from '../utils/messageTemplates'
import { openWhatsApp } from '../utils/whatsappUtils'
import { isValidIndianMobile, formatMobile } from '../utils/phoneUtils'
import { formatDate } from '../utils/dateUtils'
import { statusLabel } from '../utils/reminderUtils'

/**
 * Message preview + manual send workflow:
 *   1. Owner reviews / edits the Gujarati message.
 *   2. "Open WhatsApp" opens the prefilled chat — the reminder is NOT sent yet.
 *   3. Owner presses Send in WhatsApp.
 *   4. Owner comes back and clicks "Mark as Sent" to confirm.
 */
export default function ReminderMessagePreview({ record, open, onClose, notice }) {
  const { settings, recordWhatsAppOpen, markReminderSent, saveReminderMessage, skipReminder, cancelReminder } = useData()
  const toast = useToast()
  const [text, setText] = useState('')
  const [confirmSend, setConfirmSend] = useState(false)

  useEffect(() => {
    if (open && record) {
      setText(
        record.message ||
          buildMessage({ interval: record.interval, customer: record.customer, settings })
      )
      setConfirmSend(false)
    }
  }, [open, record, settings]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!record) return null

  const customer = record.customer
  const phoneValid = isValidIndianMobile(customer.mobile)

  const regenerate = () => {
    setText(buildMessage({ interval: record.interval, customer, settings }))
    toast.info('Message regenerated from the current template.')
  }

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Message copied to clipboard.')
    } catch {
      toast.error('Could not copy — please select the text and copy manually.')
    }
  }

  const handleOpen = () => {
    if (!phoneValid) {
      toast.error('This mobile number is invalid. Edit the customer record before opening WhatsApp.')
      return
    }
    const res = openWhatsApp(customer.mobile, text)
    if (res.ok) {
      recordWhatsAppOpen(record.id, text)
      toast.success('WhatsApp chat opened. Press Send inside WhatsApp, then click "Mark as Sent" here.')
    } else {
      toast.error(res.error)
    }
  }

  const handleConfirmSent = () => {
    saveReminderMessage(record.id, text)
    markReminderSent(record.id)
    setConfirmSend(false)
    toast.success(`${record.interval}-day reminder marked as sent and confirmed.`)
    onClose()
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`${record.interval}-Day Reminder — ${customer.name}`}
        size="lg"
        footer={
          <>
            <button
              onClick={copyText}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50"
            >
              <Copy className="h-4 w-4" /> Copy Text
            </button>
            <button
              onClick={regenerate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50"
              title="Rebuild the message from the current template"
            >
              <RefreshCw className="h-4 w-4" /> Reset Text
            </button>
            <button
              onClick={() => setConfirmSend(true)}
              disabled={record.status === 'sent'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" /> Mark as Sent
            </button>
            <button
              onClick={handleOpen}
              disabled={!phoneValid}
              className="inline-flex items-center gap-1.5 rounded-lg bg-whatsapp-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-whatsapp-700 disabled:cursor-not-allowed disabled:opacity-50"
              title={phoneValid ? 'Open the WhatsApp chat with this message' : 'Invalid mobile number'}
            >
              <MessageCircle className="h-4 w-4" /> Open WhatsApp
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <p>
                <span className="text-slate-500">Vehicle:</span>{' '}
                <span className="font-mono font-semibold text-navy-800">{customer.vehicleNumber}</span> ({customer.vehicleType})
              </p>
              <p>
                <span className="text-slate-500">Mobile:</span>{' '}
                <span className="font-medium text-navy-800">{phoneValid ? formatMobile(customer.mobile) : 'Invalid number'}</span>
              </p>
              <p>
                <span className="text-slate-500">PUC Expiry:</span>{' '}
                <span className="font-medium text-navy-800">{formatDate(customer.pucExpiryDate)}</span>
              </p>
              <p>
                <span className="text-slate-500">Scheduled:</span>{' '}
                <span className="font-medium text-navy-800">{formatDate(record.scheduledDate)}</span> — {statusLabel(record.state || record.status)}
              </p>
            </div>
          </div>

          {notice ? (
            <div className="flex gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{notice}</p>
            </div>
          ) : null}

          {!phoneValid ? (
            <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                The mobile number <strong>{customer.mobile || '(empty)'}</strong> is not a valid Indian mobile number, so WhatsApp cannot be
                opened. Edit the customer and enter a valid 10-digit number starting with 6, 7, 8 or 9.
              </p>
            </div>
          ) : null}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="wa-message" className="text-sm font-medium text-navy-800">
                Message (Gujarati) — you can edit before sending
              </label>
              <span className="text-xs text-slate-400">{text.length} characters</span>
            </div>
            <textarea
              id="wa-message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              dir="auto"
              className="w-full rounded-xl border border-slate-300 p-3 text-[15px] leading-6 text-navy-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <p className="mt-1 text-xs text-slate-400">Edits apply to this reminder only. Change the permanent template in Settings.</p>
          </div>

          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              This app opens WhatsApp with your message prefilled — <strong>you press Send inside WhatsApp yourself</strong>. The app cannot
              verify delivery or reading. Only click <strong>Mark as Sent</strong> after you have actually sent the message. Your edited text
              is saved with this reminder for the history record.
            </p>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmSend}
        onClose={() => setConfirmSend(false)}
        onConfirm={handleConfirmSent}
        title="Confirm the message was sent?"
        message={`Mark the ${record.interval}-day reminder for ${customer.vehicleNumber} as "Sent — Confirmed by Owner"? Only do this after you have pressed Send in WhatsApp.`}
        confirmLabel="Yes, I sent it"
      />
    </>
  )
}
