import { useEffect, useState } from 'react'
import Modal from './Modal'
import { AlertTriangle } from 'lucide-react'

/**
 * Confirmation dialog for destructive or important actions.
 * When `requireText` is set the user must type that exact phrase
 * (e.g. "DELETE") before the confirm button enables.
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  requireText = null,
}) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const matches = !requireText || typed.trim().toUpperCase() === requireText.toUpperCase()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              if (!matches) return
              onConfirm()
            }}
            disabled={!matches}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        {danger ? (
          <div className="mt-0.5 shrink-0 rounded-full bg-red-50 p-2">
            <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
          </div>
        ) : null}
        <div className="text-sm text-slate-600">
          {typeof message === 'string' ? <p>{message}</p> : message}
          {requireText ? (
            <div className="mt-4">
              <label htmlFor="confirm-phrase" className="mb-1 block text-sm font-medium text-navy-800">
                Type <span className="font-bold">{requireText}</span> to confirm
              </label>
              <input
                id="confirm-phrase"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
