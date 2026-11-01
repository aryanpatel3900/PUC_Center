import ExcelImport from '../components/ExcelImport'
import { FileSpreadsheet, Cloud, FileClock } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Import Excel / CSV customers page. */
export default function ImportPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-navy-800">
            <FileSpreadsheet className="h-6 w-6 text-brand-600" aria-hidden="true" /> Import Customers
          </h1>
          <p className="text-sm text-slate-500">
            Upload your Excel or CSV file (.xlsx, .xls or .csv). Column names, order, extra columns and common date formats are detected
            automatically — then check the preview and confirm.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <p className="flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800">
            <Cloud className="h-4 w-4" aria-hidden="true" /> Valid customer records are saved securely to Supabase
          </p>
          <Link
            to="/imports"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-navy-700 transition hover:bg-slate-50"
          >
            <FileClock className="h-4 w-4" aria-hidden="true" /> View Import History
          </Link>
        </div>
      </div>
      <ExcelImport />
    </div>
  )
}
