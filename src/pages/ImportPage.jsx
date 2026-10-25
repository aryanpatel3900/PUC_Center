import ExcelImport from '../components/ExcelImport'
import { FileSpreadsheet, ShieldCheck } from 'lucide-react'

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
        <p className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> 100% offline — files never leave this computer
        </p>
      </div>
      <ExcelImport />
    </div>
  )
}
