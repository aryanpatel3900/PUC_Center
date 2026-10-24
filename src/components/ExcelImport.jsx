import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Columns3,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import {
  FIELDS,
  readSpreadsheet,
  detectHeaderRow,
  autoMapColumns,
  parseRows,
  downloadTemplate,
} from '../utils/excelUtils'
import { formatDate } from '../utils/dateUtils'
import ConfirmDialog from './ConfirmDialog'

const STEPS = ['Select file', 'Match columns', 'Preview & fix', 'Duplicates', 'Summary']

/** Multi-step Excel / CSV import wizard. */
export default function ExcelImport() {
  const { customers, importRecords } = useData()
  const toast = useToast()
  const navigate = useNavigate()
  const fileInput = useRef(null)

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [readError, setReadError] = useState('')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rows, setRows] = useState([])
  const [headerRow, setHeaderRow] = useState(0)
  const [mapping, setMapping] = useState({})
  const [records, setRecords] = useState([])
  const [dupMode, setDupMode] = useState('skip')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [summary, setSummary] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const reset = () => {
    setStep(0)
    setFileName('')
    setHeaders([])
    setRows([])
    setRecords([])
    setSummary(null)
    setReadError('')
  }

  const handleFile = async (file) => {
    if (!file) return
    setLoading(true)
    setReadError('')
    try {
      const { rows: sheetRows } = await readSpreadsheet(file)
      if (!sheetRows.length) throw new Error('The file appears to be empty.')
      const hRow = detectHeaderRow(sheetRows)
      const hdrs = (sheetRows[hRow] || []).map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`)
      setFileName(file.name)
      setRows(sheetRows)
      setHeaderRow(hRow)
      setHeaders(hdrs)
      setMapping(autoMapColumns(hdrs))
      setStep(1)
    } catch (e) {
      setReadError(e.message || 'Could not read this file. Please use a .xlsx, .xls or .csv file.')
      toast.error(e.message || 'Could not read this file.')
    } finally {
      setLoading(false)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    handleFile(file)
  }

  const buildPreview = () => {
    const parsed = parseRows(rows, headerRow, mapping, customers)
    setRecords(parsed)
    setStep(2)
  }

  const validRecords = records.filter((r) => r.valid)
  const invalidRecords = records.filter((r) => !r.valid)
  const duplicateRecords = validRecords.filter((r) => r.duplicate)

  const doImport = () => {
    const res = importRecords(validRecords, dupMode)
    setSummary(res)
    setConfirmOpen(false)
    setStep(4)
    toast.success(`Import finished: ${res.imported} added, ${res.updated} updated.`)
  }

  const missingRequired = FIELDS.filter((f) => f.required && mapping[f.key] === undefined).map((f) => f.label)

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <ol className="flex flex-wrap gap-2" aria-label="Import steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
              i === step ? 'bg-brand-600 text-white' : i < step ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25">{i < step ? '✓' : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {/* Step 0 — file selection */}
      {step === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
              dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-brand-600" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-navy-800">Reading the file…</p>
              </>
            ) : (
              <>
                <UploadCloud className="h-10 w-10 text-slate-400" aria-hidden="true" />
                <h3 className="mt-3 text-base font-semibold text-navy-800">Upload your customer sheet</h3>
                <p className="mt-1 max-w-md text-sm text-slate-500">
                  Drag and drop an <strong>.xlsx</strong>, <strong>.xls</strong> or <strong>.csv</strong> file here, or click to browse. Common
                  column names like “Owner Name”, “Phone” or “Valid Until” are detected automatically.
                </p>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  aria-label="Choose Excel or CSV file"
                />
                <button
                  onClick={() => fileInput.current?.click()}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Choose File
                </button>
                {readError ? (
                  <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-red-600">
                    <XCircle className="h-4 w-4" /> {readError}
                  </p>
                ) : null}
                <button
                  onClick={downloadTemplate}
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
                >
                  <Download className="h-4 w-4" /> Download the sample Excel template
                </button>
              </>
            )}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Nothing is uploaded to the internet — the file is read inside your browser only. Existing records are never deleted by an import.
          </p>
        </div>
      ) : null}

      {/* Step 1 — column mapping */}
      {step === 1 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <Columns3 className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <h3 className="text-base font-semibold text-navy-800">Match columns — {fileName}</h3>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            Recognised columns were matched automatically. Change any selection if a column was not detected correctly. Required fields are
            marked with *.
          </p>
          {missingRequired.length ? (
            <div className="mb-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                Not detected automatically: <strong>{missingRequired.join(', ')}</strong>. Please select the matching columns below, or go back
                and use a file with these columns.
              </p>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label htmlFor={`map-${f.key}`} className="mb-1 block text-sm font-medium text-navy-800">
                  {f.label} {f.required ? <span className="text-red-500">*</span> : null}
                </label>
                <select
                  id={`map-${f.key}`}
                  value={mapping[f.key] ?? -1}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  <option value={-1}>— Not in this file —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Dates are read as DD/MM/YYYY (Indian format). If a date like 05/04/2026 could mean two different days, it will be shown for your
            check in the preview step.
          </p>
          <div className="mt-6 flex gap-2">
            <button onClick={() => setStep(0)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={buildPreview}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Preview Records <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Step 2 — preview & validation */}
      {step === 2 ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <PreviewStat label="Rows detected" value={records.length} tone="slate" />
            <PreviewStat label="Valid records" value={validRecords.length} tone="green" />
            <PreviewStat label="Invalid records" value={invalidRecords.length} tone="red" />
            <PreviewStat label="Duplicates found" value={duplicateRecords.length} tone="amber" />
          </div>

          {invalidRecords.length ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
                <XCircle className="h-4 w-4" /> {invalidRecords.length} record(s) need correction and will NOT be imported
              </p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-red-700">
                {invalidRecords.slice(0, 30).map((r) => (
                  <li key={r.rowNum}>
                    Row {r.rowNum}: {r.errors.join('; ')}
                  </li>
                ))}
                {invalidRecords.length > 30 ? <li>…and {invalidRecords.length - 30} more</li> : null}
              </ul>
            </div>
          ) : null}

          {duplicateRecords.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" /> {duplicateRecords.length} vehicle number(s) already exist — you will choose to skip or
                update them in the next step
              </p>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-3 font-semibold">Row</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Mobile</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Vehicle</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Expiry (read as)</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.slice(0, 100).map((r) => (
                  <tr key={r.rowNum} className={r.valid ? '' : 'bg-red-50/50'}>
                    <td className="px-4 py-2 text-slate-400">{r.rowNum}</td>
                    <td className="px-4 py-2 font-medium text-navy-800">{r.name || <span className="text-red-500">—</span>}</td>
                    <td className="px-4 py-2">{r.mobile || <span className="text-red-500">{r.mobileRaw || '—'}</span>}</td>
                    <td className="px-4 py-2 font-mono text-[13px] text-navy-700">{r.vehicleNumber || '—'}</td>
                    <td className="px-4 py-2 text-slate-600">{r.vehicleType}</td>
                    <td className="px-4 py-2">
                      {r.pucExpiryDate ? formatDate(r.pucExpiryDate) : <span className="text-red-500">—</span>}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {r.duplicate ? <span className="font-medium text-amber-700">Duplicate of existing vehicle</span> : null}
                      {r.ambiguousDate ? <span className="block font-medium text-amber-700">{r.warnings[0]}</span> : null}
                      {!r.valid ? <span className="block font-medium text-red-600">{r.errors.join('; ')}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {records.length > 100 ? (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
                Showing the first 100 of {records.length} rows. All rows will be imported.
              </p>
            ) : null}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!validRecords.length}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue ({validRecords.length} valid) <ArrowRight className="h-4 w-4" />
            </button>
            <button onClick={reset} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-navy-800">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Step 3 — duplicate handling */}
      {step === 3 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <h3 className="text-base font-semibold text-navy-800">How should duplicate vehicles be handled?</h3>
          <p className="mt-1 text-sm text-slate-500">
            {duplicateRecords.length
              ? `${duplicateRecords.length} vehicle number(s) in the file already exist in your records. Nothing is ever deleted — choose what to do with these.`
              : 'No duplicates were found, but you can still choose how to handle them in case any appear.'}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className={`flex cursor-pointer gap-3 rounded-xl border-2 p-4 transition ${dupMode === 'skip' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input
                type="radio"
                name="dupMode"
                checked={dupMode === 'skip'}
                onChange={() => setDupMode('skip')}
                className="mt-1 accent-brand-600"
              />
              <span>
                <span className="block text-sm font-semibold text-navy-800">Skip duplicates (recommended)</span>
                <span className="mt-0.5 block text-sm text-slate-500">Keep your existing record untouched and import only new vehicles.</span>
              </span>
            </label>
            <label className={`flex cursor-pointer gap-3 rounded-xl border-2 p-4 transition ${dupMode === 'update' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input
                type="radio"
                name="dupMode"
                checked={dupMode === 'update'}
                onChange={() => setDupMode('update')}
                className="mt-1 accent-brand-600"
              />
              <span>
                <span className="block text-sm font-semibold text-navy-800">Update existing records</span>
                <span className="mt-0.5 block text-sm text-slate-500">The file's details (name, mobile, new expiry) overwrite the old record.</span>
              </span>
            </label>
          </div>
          <div className="mt-6 flex gap-2">
            <button onClick={() => setStep(2)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4" /> Import {validRecords.length} Record(s)
            </button>
          </div>
        </div>
      ) : null}

      {/* Step 4 — summary */}
      {step === 4 && summary ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
            <h3 className="text-base font-semibold text-navy-800">Import summary</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SummaryTile label="Total rows in file" value={summary.total} />
            <SummaryTile label="Successfully imported" value={summary.imported} tone="text-emerald-600" />
            <SummaryTile label="Existing records updated" value={summary.updated} tone="text-brand-700" />
            <SummaryTile label="Duplicates skipped" value={summary.skipped} tone="text-amber-600" />
            <SummaryTile label="Invalid records (not imported)" value={summary.invalid} tone="text-red-600" />
            <SummaryTile label="Records needing correction" value={summary.needsCorrection} tone="text-red-600" />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/customers')}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              View Customers
            </button>
            <button
              onClick={() => navigate('/reminders?tab=today')}
              className="rounded-lg bg-tealx-600 px-4 py-2 text-sm font-semibold text-white hover:bg-tealx-700"
            >
              Open Reminder Center
            </button>
            <button onClick={reset} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-slate-50">
              Import Another File
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doImport}
        title="Confirm import"
        message={
          <p>
            {validRecords.length} record(s) will be saved ({dupMode === 'skip' ? 'duplicates skipped' : 'existing records updated'}). Your
            existing data is never deleted by an import. Continue?
          </p>
        }
        confirmLabel="Yes, import now"
      />
    </div>
  )
}

function PreviewStat({ label, value, tone }) {
  const tones = {
    slate: 'text-navy-800',
    green: 'text-emerald-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</p>
    </div>
  )
}

function SummaryTile({ label, value, tone = 'text-navy-800' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-sm text-slate-500">{label}</p>
    </div>
  )
}
