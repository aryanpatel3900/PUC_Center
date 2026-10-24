import { useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Plus, Search, FileDown, Filter, ArrowUpDown, Users } from 'lucide-react'
import CustomerTable from '../components/CustomerTable'
import CustomerForm from '../components/CustomerForm'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { VEHICLE_TYPES, exportCustomers } from '../utils/excelUtils'
import { expiryStatus } from '../utils/reminderUtils'
import { diffDays } from '../utils/dateUtils'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'expiring', label: 'Expiring Soon (30 days)' },
  { key: 'expired', label: 'Expired' },
  { key: 'upcoming', label: 'Upcoming' },
]

/** Customer list with search, filters, sorting, pagination and export. */
export default function Customers() {
  const { customers, reminders, today, settings, fmtDate, deleteCustomer } = useData()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const q = params.get('q') || ''
  const filter = params.get('filter') || 'all'
  const type = params.get('type') || 'all'
  const sort = params.get('sort') || 'expiry'
  const page = Math.max(1, Number(params.get('page') || 1))
  const pageSize = settings.pageSize || 25

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value && value !== 'all' && value !== '') next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = customers.filter((c) => {
      if (needle) {
        const hay = `${c.name} ${c.mobile} ${c.vehicleNumber}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      if (type !== 'all' && c.vehicleType !== type) return false
      if (filter === 'expired') return expiryStatus(c, today) === 'expired'
      if (filter === 'expiring') {
        const st = expiryStatus(c, today)
        return st === 'expiring_soon' || st === 'expiring_today'
      }
      if (filter === 'upcoming') return expiryStatus(c, today) === 'upcoming'
      return true
    })
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'added') return (b.createdAt || '').localeCompare(a.createdAt || '')
      if (a.pucExpiryDate === b.pucExpiryDate) return a.name.localeCompare(b.name)
      return diffDays(a.pucExpiryDate, b.pucExpiryDate)
    })
    return list
  }, [customers, q, filter, type, sort, today])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pages)
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-800">Customers</h1>
          <p className="text-sm text-slate-500">
            {filtered.length} of {customers.length} customer{customers.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              exportCustomers(filtered, reminders, today, 'puc-customers-filtered.xlsx')
              toast.success(`Exported ${filtered.length} customer(s) to Excel.`)
            }}
            disabled={!filtered.length}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" /> Export Filtered
          </button>
          <button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Add Customer
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <label htmlFor="cust-search" className="sr-only">
              Search customers
            </label>
            <input
              id="cust-search"
              value={q}
              onChange={(e) => setParam('q', e.target.value)}
              placeholder="Search by name, mobile or vehicle number…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label htmlFor="cust-filter" className="sr-only">Expiry filter</label>
            <select
              id="cust-filter"
              value={filter}
              onChange={(e) => setParam('filter', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-navy-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              {FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cust-type" className="sr-only">Vehicle type</label>
            <select
              id="cust-type"
              value={type}
              onChange={(e) => setParam('type', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-navy-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="all">All vehicle types</option>
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cust-sort" className="sr-only">Sort by</label>
            <select
              id="cust-sort"
              value={sort}
              onChange={(e) => setParam('sort', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-navy-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="expiry">Sort: Expiry date</option>
              <option value="name">Sort: Name (A–Z)</option>
              <option value="added">Sort: Recently added</option>
            </select>
          </div>
        </div>
        {(q || filter !== 'all' || type !== 'all') && (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Filter className="h-4 w-4" aria-hidden="true" />
            <span>Filters active.</span>
            <button
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
              className="font-medium text-brand-700 hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <CustomerTable
          customers={pageRows}
          today={today}
          fmtDate={fmtDate}
          onEdit={(c) => {
            setEditing(c)
            setFormOpen(true)
          }}
          onDelete={(c) => setDeleting(c)}
        />
        <Pagination page={safePage} pageSize={pageSize} total={filtered.length} onPage={(p) => setParam('page', String(p))} />
      </div>

      {filtered.length === 0 && customers.length > 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <Users className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-navy-800">No customers match the current search or filter.</p>
          <Link to="/import" className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline">
            Import from Excel instead
          </Link>
        </div>
      ) : null}

      <CustomerForm open={formOpen} onClose={() => setFormOpen(false)} customer={editing} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          deleteCustomer(deleting.id)
          toast.success(`Customer ${deleting.name} deleted. Reminder history is kept for audit.`)
          setDeleting(null)
        }}
        title="Delete customer?"
        danger
        confirmLabel="Delete"
        message={
          deleting ? (
            <p>
              Delete <span className="font-semibold text-navy-800">{deleting.name}</span> ({deleting.vehicleNumber})? Past reminder history is
              kept for auditing, but pending reminders will be cancelled. This cannot be undone.
            </p>
          ) : null
        }
      />
    </div>
  )
}
