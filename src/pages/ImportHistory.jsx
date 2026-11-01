import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileClock, FileSpreadsheet, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { listImportBatches } from '../utils/supabaseClient'
import { planBatchDeletion } from '../utils/importHistoryUtils'

/**
 * Import History: every confirmed Excel import with its filename, time and
 * counts, plus "Delete Imported Data" per batch. Deletion removes ONLY the
 * customer records that batch created (tracked by the database) — older
 * records, manual customers and pre-existing duplicate vehicles are never
 * touched. Records edited after the import are kept unless explicitly
 * included in the confirmation dialog.
 */
export default function ImportHistory() {
  const { customers, reminders, deleteImportBatch } = useData()
  const toast = useToast()

  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [confirmBatch, setConfirmBatch] = useState(null)
  const [includeEdited, setIncludeEdited] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      setBatches(await listImportBatches())
    } catch (error) {
      setLoadError(error.message || 'Import history could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const plans = useMemo(() => {
    const map = new Map()
    for (const batch of batches) {
      map.set(batch.id, planBatchDeletion(customers, reminders, batch, { includeEdited }))
    }
    return map
  }, [batches, customers, reminders, includeEdited])

  const openConfirm = (batch) => {
    setIncludeEdited(false)
    setConfirmBatch(batch)
  }

  const handleDelete = async () => {
    const batch = confirmBatch
    const plan = plans.get(batch?.id)
    if (!batch || !plan || !plan.deletable) return
    setDeleting(true)
    try {
      const result = await deleteImportBatch(batch, plan, includeEdited)
      if (!result.ok) {
        toast.error(result.error || 'The import batch could not be deleted.')
        return
      }
      toast.success(
        `Import "${batch.filename}" deleted: ${result.deletedCustomers} customer record(s) removed.` +
          (result.keptEdited ? ` ${result.keptEdited} edited record(s) were kept.` : '')
      )
      setConfirmBatch(null)
      await refresh()
    } finally {
      setDeleting(false)
    }
  }

  const formatTime = (iso) => {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso || ''
    return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  const activePlan = confirmBatch ? plans.get(confirmBatch.id) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-navy-800">
            <FileClock className="h-6 w-6 text-brand-600" aria-hidden="true" /> Import History
          </h1>
          <p className="text-sm text-slate-500">
            Every Excel import is recorded here with its file name, time and counts. You can delete an import to remove exactly the
            customer records it created — records you added manually, older data and vehicles that already existed are never touched.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
          <Link
            to="/import"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Import Excel
          </Link>
        </div>
      </div>

      {loadError ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-card">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading import history…
        </div>
      ) : batches.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-card">
          <EmptyState
            icon={FileClock}
            title="No imports recorded yet"
            description="Imports confirmed after the import-history database update will appear here."
            action={
              <Link
                to="/import"
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Import an Excel file
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {batches.map((batch) => {
            const plan = plans.get(batch.id)
            const present = batch.createdCustomerIds.length - plan.missingIds.length
            return (
              <li key={batch.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-navy-800" title={batch.filename}>
                      {batch.filename}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{formatTime(batch.importedAt)}</p>
                  </div>
                  <button
                    onClick={() => openConfirm(batch)}
                    disabled={!plan?.deletable}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                    title={plan?.deletable ? 'Delete the customer records this import created' : 'No customer records from this import remain'}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete Imported Data
                  </button>
                </div>
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
                  <div>
                    <dt className="inline font-medium text-slate-500">Rows: </dt>
                    <dd className="inline">{batch.totalRows}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-500">Imported: </dt>
                    <dd className="inline text-emerald-700">{batch.importedCount}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-500">Duplicates skipped: </dt>
                    <dd className="inline text-amber-700">{batch.skippedCount}</dd>
                  </div>
                  {batch.conflictsCount ? (
                    <div>
                      <dt className="inline font-medium text-slate-500">Conflicts: </dt>
                      <dd className="inline text-orange-700">{batch.conflictsCount}</dd>
                    </div>
                  ) : null}
                  {batch.invalidCount ? (
                    <div>
                      <dt className="inline font-medium text-slate-500">Invalid rows: </dt>
                      <dd className="inline text-red-600">{batch.invalidCount}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="inline font-medium text-slate-500">Records still present: </dt>
                    <dd className="inline">{present}</dd>
                  </div>
                </dl>
                {plan && plan.editedIds.length > 0 ? (
                  <p className="mt-2 text-xs font-medium text-orange-700">
                    {plan.editedIds.length} of these record(s) were edited after the import — they are kept unless you explicitly
                    include them in the delete confirmation.
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(confirmBatch)}
        onClose={() => setConfirmBatch(null)}
        onConfirm={() => void handleDelete()}
        danger
        busy={deleting}
        title="Delete this import?"
        confirmLabel={
          deleting
            ? 'Deleting…'
            : `Delete ${activePlan ? activePlan.targetIds.length : 0} customer record(s)`
        }
        message={
          confirmBatch ? (
            <div className="space-y-3">
              <p>
                You are about to delete the customer records created by the import of{' '}
                <span className="font-semibold text-navy-800">“{confirmBatch.filename}”</span> ({formatTime(confirmBatch.importedAt)}).
              </p>
              <p>
                <span className="font-semibold text-navy-800">
                  {activePlan ? activePlan.targetIds.length : 0} customer record(s) will be deleted
                </span>
                . Only records created by this import are removed — customers you added manually, older data and vehicles that already
                existed before this import are never touched.
              </p>
              {activePlan && activePlan.editedIds.length > 0 ? (
                <label className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
                  <input
                    type="checkbox"
                    checked={includeEdited}
                    onChange={(e) => setIncludeEdited(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-orange-600"
                  />
                  <span>
                    <span className="font-semibold">Warning:</span> {activePlan.editedIds.length} of these record(s) were edited after
                    the import. They are kept by default — tick this box only if you also want the edited records deleted.
                  </span>
                </label>
              ) : null}
              {activePlan && activePlan.linkedReminders > 0 ? (
                <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  {activePlan.linkedReminders} reminder record(s) belong to these customers. Reminder history is kept for audit;
                  pending reminders of deleted customers are cancelled automatically.
                </p>
              ) : null}
              <p className="text-xs text-slate-500">This cannot be undone. A JSON backup can be downloaded from Settings first.</p>
            </div>
          ) : null
        }
      />
    </div>
  )
}
