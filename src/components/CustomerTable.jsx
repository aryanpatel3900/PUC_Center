import { Link } from 'react-router-dom'
import { Eye, Pencil, Trash2, CarFront } from 'lucide-react'
import StatusBadge from './StatusBadge'
import EmptyState from './EmptyState'
import { diffDays, formatDate } from '../utils/dateUtils'
import { expiryStatus, EXPIRY_META } from '../utils/reminderUtils'
import { formatMobile } from '../utils/phoneUtils'

/** Customer list table with expiry status indicators. */
export default function CustomerTable({ customers, today, fmtDate, onEdit, onDelete }) {
  if (!customers.length) {
    return (
      <EmptyState
        icon={CarFront}
        title="No customers found"
        description="Add a customer manually or import an Excel file to get started."
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
            <th scope="col" className="px-4 py-3 font-semibold">Mobile</th>
            <th scope="col" className="px-4 py-3 font-semibold">Vehicle</th>
            <th scope="col" className="px-4 py-3 font-semibold">PUC Expiry</th>
            <th scope="col" className="px-4 py-3 font-semibold">Status</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {customers.map((c) => {
            const days = diffDays(today, c.pucExpiryDate)
            const st = expiryStatus(c, today)
            const meta = EXPIRY_META[st]
            return (
              <tr key={c.id} className="transition hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <Link to={`/customers/${c.id}`} className="font-semibold text-navy-800 hover:text-brand-700 hover:underline">
                    {c.name}
                  </Link>
                  {c.isSample ? (
                    <span className="ml-2 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">SAMPLE</span>
                  ) : null}
                  {c.email ? <p className="truncate text-xs text-slate-400">{c.email}</p> : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatMobile(c.mobile)}</td>
                <td className="px-4 py-3">
                  <p className="font-mono text-[13px] font-semibold text-navy-700">{c.vehicleNumber}</p>
                  <p className="text-xs text-slate-400">{c.vehicleType}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <p className="font-medium text-navy-800">{fmtDate(c.pucExpiryDate)}</p>
                  <p className="text-xs text-slate-500">
                    {days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago` : days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} left`}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      to={`/customers/${c.id}`}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-sky-50 hover:text-sky-700"
                      aria-label={`View ${c.name}`}
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => onEdit(c)}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-brand-50 hover:text-brand-700"
                      aria-label={`Edit ${c.name}`}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDelete(c)}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-700"
                      aria-label={`Delete ${c.name}`}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
