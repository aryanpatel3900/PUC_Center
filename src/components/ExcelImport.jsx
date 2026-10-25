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
  Eye,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import {
  FIELDS,
  readWorkbook,
  analyzeWorkbook,
  parseRows,
  downloadTemplate,
} from '../utils/excelUtils'
import { formatDate } from '../utils/dateUtils'
import ConfirmDialog from './ConfirmDialog'
import Modal from './Modal'

const STEPS = ['Select file', 'Check columns', 'Preview', 'Summary']
const PREVIEW_ROWS = 10
const ERROR_PAGE_SIZE = 25

/**
 * Smart Excel / CSV import wizard.
 * Detects the header row, maps columns by meaning (headers first, value
 * patterns second), inspects every worksheet, and only ever reports rows that
 * are genuinely missing required data.
 */
export default function ExcelImport() {
  const { customers, importRecords } = useData()
  const toast = useToast()
  const navigate = useNavigate()
  const fileInput = useRef(null)

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [readError, setReadError] = useState('')
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState([]) // analysed sheets from analyzeWorkbook
  const [sheetIndex, setSheetIndex] = useState(0)
  const [headers, setHeaders] = useState([])
  const [headerRow, setHeaderRow] = useState(-1)
  const [method, setMethod] = useState('none')
  const [requiredFound, setRequiredFound] = useState(0)
  const [dataRowCount, setDataRowCount] = useState(0)
  const [mapping, setMapping] = useState({})
  const [records, setRecords] = useState([])
  const [dupMode, setDupMode] = useState('skip')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [summary, setSummary] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [errorsPage, setErrorsPage] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)

  const currentSheet = sheets[sheetIndex]

  const reset = () => {
    setStep(0)
    setFileName('')
    setSheets([])
    setSheetIndex(0)
    setHeaders([])
    setRecords([])
    setSummary(null)
    setReadError('')
    setShowErrors(false)
    setShowDuplicates(false)
  }

  const applySheet = (idx) => {
    const s = sheets[idx]
    if (!s) return
    setSheetIndex(idx)
    setHeaders(s.headers)
    setHeaderRow(s.headerRow)
    setMapping({ ...s.mapping })
    setMethod(s.method)
    setRequiredFound(s.requiredFound)
    setDataRowCount(s.dataRowCount)
  }

  const handleFile = async (file) => {
    if (!file) return
    setLoading(true)
    setReadError('')
    try {
      const wb = await readWorkbook(file)
      const analysis = analyzeWorkbook(wb)
      if (!analysis.sheets.length) throw new Error('This file appears to be empty.')
      setFileName(file.name)
      setSheets(analysis.sheets)
      // applySheet reads `sheets` state which is not committed yet — build locally.
      const best = analysis.sheets[analysis.bestIndex]
      setSheetIndex(analysis.bestIndex)
      setHeaders(best.headers)
      setHeaderRow(best.headerRow)
      setMapping({ ...best.mapping })
      setMethod(best.method)
      setRequiredFound(best.requiredFound)
      setDataRowCount(best.dataRowCount)
      setRecords([])
      setStep(1)
      if (analysis.candidateCount === 0) {
        toast.info?.('No customer columns were recognised — please check the column matching.')
      }
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
    handleFile(e.dataTransfer.files?.[0])
  }

  const missingRequired = FIELDS.filter((f) => f.required && (mapping[f.key] ?? -1) < 0)
  const canContinue = missingRequired.length === 0 && dataRowCount > 0

  const buildPreview = () => {
    const parsed = parseRows(currentSheet.rows, headerRow, mapping, customers, currentSheet.rowOffset)
    setRecords(parsed)
    setErrorsPage(0)
    setStep(2)
  }

  const validRecords = records.filter((r) => r.valid)
  const invalidRecords = records.filter((r) => !r.valid)
  const duplicateRecords = validRecords.filter((r) => r.duplicate)

  const doImport = () => {
    const res = importRecords(records, dupMode)
    setSummary(res)
    setConfirmOpen(false)
    setStep(3)
    toast.success(`Import finished: ${res.imported} added, ${res.updated} updated.`)
  }

  const errorPages = Math.max(1, Math.ceil(invalidRecords.length / ERROR_PAGE_SIZE))
  const pageErrors = invalidRecords.slice(errorsPage * ERROR_PAGE_SIZE, (errorsPage + 1) * ERROR_PAGE_SIZE)

  const ignoredColumns = headers.filter((h, i) => !Object.values(mapping).includes(i))

  const methodLabel = {
    header: 'Columns detected from your file’s headings',
    values: 'Columns detected from the data patterns (no headings found)',
    mixed: 'Columns detected from headings + data patterns',
    none: 'No columns detected yet — please match them manually',
  }[method]

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
                <h3 className="mt-3 text-base font-semibold text-navy-800">Upload your Excel or CSV file</h3>
                <p className="mt-1 max-w-md text-sm text-slate-500">
                  Drag and drop an <strong>.xlsx</strong>, <strong>.xls</strong> or <strong>.csv</strong> file here, or click to browse. Any
                  column names, column order and extra columns are understood automatically.
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
                  <FileSpreadsheet className="h-4 w-4" /> Choose Excel / CSV File
                </button>
                {readError ? (
                  <p className="mt-4 flex max-w-md items-center gap-1.5 text-sm font-medium text-red-600">
                    <XCircle className="h-4 w-4 shrink-0" /> {readError}
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

      {/* Step 1 — sheet + column matching */}
      {step === 1 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <div className="mb-1 flex items-center gap-2">
            <Columns3 className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <h3 className="text-base font-semibold text-navy-800">Check columns — {fileName}</h3>
          </div>
          <p className="text-sm text-slate-500">
            {methodLabel}. Change any selection below if something was matched incorrectly. Required fields are marked with *.
          </p>

          {/* Worksheet selector — only when several sheets look like customer data */}
          {sheets.length > 1 && sheets.filter((s) => s.dataRowCount > 0).length > 1 ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label htmlFor="sheet-select" className="text-sm font-medium text-navy-800">
                Select Sheet
              </label>
              <select
                id="sheet-select"
                value={sheetIndex}
                onChange={(e) => applySheet(Number(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {sheets.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name}
                    {s.dataRowCount ? ` (${s.dataRowCount} rows)` : ' (no data)'}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Friendly message when nothing was recognised */}
          {requiredFound === 0 ? (
            <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                <strong>We couldn't find customer data in this file.</strong> Please make sure your file contains fields such as{' '}
                <strong>Name, Mobile, Vehicle Number and PUC Expiry</strong>. You can still match the columns manually below.
              </p>
            </div>
          ) : missingRequired.length ? (
            <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                Still needed: <strong>{missingRequired.map((f) => f.label).join(', ')}</strong>. Please select the matching columns below to
                continue.
              </p>
            </div>
          ) : dataRowCount === 0 ? (
            <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                <strong>No customer rows found below the header.</strong> Check that the selected sheet contains your data, or go back and pick
                another file.
              </p>
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> All required columns found — {dataRowCount} data row(s) detected.
            </p>
          )}

          {/* Excel Column → Application Field */}
          <div className="mt-4 space-y-3">
            {FIELDS.map((f) => {
              const idx = mapping[f.key] ?? -1
              const matched = idx >= 0
              return (
                <div
                  key={f.key}
                  className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center ${
                    f.required && !matched ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200'
                  }`}
                >
                  <div className="sm:w-56">
                    <p className="text-sm font-medium text-navy-800">
                      {f.label} {f.required ? <span className="text-red-500">*</span> : null}
                    </p>
                    <p className={`text-xs ${matched ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {matched ? `Excel: ${headers[idx]}` : 'Not matched'}
                    </p>
                  </div>
                  <ArrowRight className="hidden h-4 w-4 text-slate-400 sm:block" aria-hidden="true" />
                  <select
                    aria-label={`Excel column for ${f.label}`}
                    value={idx}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  >
                    <option value={-1}>— Not in this file —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                  <span className={`text-xs font-medium ${matched ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {matched ? '✓ Detected' : 'Needs matching'}
                  </span>
                </div>
              )
            })}
          </div>

          {ignoredColumns.length ? (
            <p className="mt-4 text-xs text-slate-400">
              Ignored (not needed): {ignoredColumns.join(', ')}
            </p>
          ) : null}

          <p className="mt-3 text-xs text-slate-400">
            Dates are read as DD/MM/YYYY (Indian format), plus common formats like YYYY-MM-DD and Excel serial numbers. If a date like
            05/04/2026 could mean two different days, it will be flagged for your check in the preview.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              onClick={() => setStep(0)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={buildPreview}
              disabled={!canContinue}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Preview Records <ArrowRight className="h-4 w-4" />
            </button>
            <button onClick={reset} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-navy-800">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Step 2 — preview & import */}
      {step === 2 ? (
        <div className="space-y-4">
          {/* Summary block */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <p className="text-sm font-semibold text-navy-800">Excel Import</p>
            <p className="mt-1 text-sm text-slate-500">File: {fileName}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PreviewStat label="Records detected" value={records.length} tone="slate" />
              <PreviewStat label="Valid" value={validRecords.length} tone="green" />
              <PreviewStat label="Need correction" value={invalidRecords.length} tone={invalidRecords.length ? 'red' : 'slate'} />
              <PreviewStat label="Duplicates" value={duplicateRecords.length} tone={duplicateRecords.length ? 'amber' : 'slate'} />
            </div>
          </div>

          {/* Errors — count + first 10 + view all (paginated modal) */}
          {invalidRecords.length ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
                <XCircle className="h-4 w-4" /> {invalidRecords.length} record(s) need correction and will NOT be imported
              </p>
              <ul className="mt-2 space-y-1 text-sm text-red-700">
                {invalidRecords.slice(0, 10).map((r) => (
                  <li key={r.rowNum}>
                    Row {r.rowNum} — {r.errors.join('; ')}
                  </li>
                ))}
                {invalidRecords.length > 10 ? <li className="text-red-500">…and {invalidRecords.length - 10} more</li> : null}
              </ul>
              <button
                onClick={() => setShowErrors(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                <Eye className="h-3.5 w-3.5" /> View All Errors
              </button>
            </div>
          ) : (
            <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4" /> All {records.length} detected record(s) are valid.
            </p>
          )}

          {/* Duplicates */}
          {duplicateRecords.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" /> {duplicateRecords.length} duplicate record(s) found (same vehicle number)
              </p>
              <div className="mt-3 flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-amber-900">
                  <input type="radio" name="dupMode" checked={dupMode === 'skip'} onChange={() => setDupMode('skip')} className="accent-brand-600" />
                  Skip duplicates (keep existing)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-amber-900">
                  <input type="radio" name="dupMode" checked={dupMode === 'update'} onChange={() => setDupMode('update')} className="accent-brand-600" />
                  Update existing records
                </label>
                <button
                  onClick={() => setShowDuplicates(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                >
                  <Eye className="h-3.5 w-3.5" /> Review duplicates
                </button>
              </div>
            </div>
          ) : null}

          {/* Preview table — first 10 rows only */}
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
                {records.slice(0, PREVIEW_ROWS).map((r) => (
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
                      {r.duplicate ? <span className="font-medium text-amber-700">{r.duplicate.reason}</span> : null}
                      {r.possibleDuplicate ? <span className="block font-medium text-amber-700">{r.possibleDuplicate}</span> : null}
                      {r.ambiguousDate ? <span className="block font-medium text-amber-700">{r.warnings[0]}</span> : null}
                      {!r.valid ? <span className="block font-medium text-red-600">{r.errors.join('; ')}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {records.length > PREVIEW_ROWS ? (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
                Showing the first {PREVIEW_ROWS} of {records.length} records. All valid records will be imported.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={!validRecords.length}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> Import {validRecords.length} Valid Record(s)
            </button>
            <button onClick={reset} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-navy-800">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Step 3 — summary */}
      {step === 3 && summary ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
            <h3 className="text-base font-semibold text-navy-800">Import summary</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SummaryTile label="Records detected" value={summary.total} />
            <SummaryTile label="Successfully imported" value={summary.imported} tone="text-emerald-600" />
            <SummaryTile label="Existing records updated" value={summary.updated} tone="text-brand-700" />
            <SummaryTile label="Duplicates skipped" value={summary.skipped} tone="text-amber-600" />
            <SummaryTile label="Need correction (not imported)" value={summary.needsCorrection} tone="text-red-600" />
            <SummaryTile label="Valid records imported" value={summary.imported + summary.updated} tone="text-emerald-600" />
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

      {/* All errors — paginated modal */}
      <Modal
        open={showErrors}
        onClose={() => setShowErrors(false)}
        title={`${invalidRecords.length} record(s) need correction`}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
              Page {errorsPage + 1} of {errorPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setErrorsPage((p) => Math.max(0, p - 1))}
                disabled={errorsPage === 0}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-navy-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setErrorsPage((p) => Math.min(errorPages - 1, p + 1))}
                disabled={errorsPage >= errorPages - 1}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-navy-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        }
      >
        <p className="mb-3 text-sm text-slate-500">Only the rows below are affected — all other records import normally.</p>
        <ul className="space-y-1.5 text-sm">
          {pageErrors.map((r) => (
            <li key={r.rowNum} className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
              <span className="font-semibold">Row {r.rowNum}</span> — {r.errors.join('; ')}
            </li>
          ))}
        </ul>
      </Modal>

      {/* Duplicate review — paginated modal */}
      <Modal
        open={showDuplicates}
        onClose={() => setShowDuplicates(false)}
        title={`${duplicateRecords.length} duplicate record(s)`}
        size="lg"
      >
        <p className="mb-3 text-sm text-slate-500">
          These rows match a vehicle number already in your records (or earlier in this file). Choose “Skip” or “Update” above — nothing is
          ever deleted automatically.
        </p>
        <ul className="space-y-1.5 text-sm">
          {duplicateRecords.slice(0, 50).map((r) => (
            <li key={r.rowNum} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
              <span className="font-semibold">Row {r.rowNum}</span> — {r.name} ({r.vehicleNumber}) — {r.duplicate.reason}
            </li>
          ))}
          {duplicateRecords.length > 50 ? <li className="text-xs text-slate-400">…and {duplicateRecords.length - 50} more</li> : null}
        </ul>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doImport}
        title="Confirm import"
        message={
          <p>
            {validRecords.length} valid record(s) will be saved ({dupMode === 'skip' ? 'duplicates skipped' : 'existing records updated'})
            {invalidRecords.length ? `, ${invalidRecords.length} record(s) needing correction will be left out` : ''}. Your existing data is
            never deleted by an import. Continue?
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
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tones[tone]}`}>{value}</p>
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
