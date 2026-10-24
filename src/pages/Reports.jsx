import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts'
import { BarChart3, FileDown, Download } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { joinReminders, effectiveStatus, computeStats } from '../utils/reminderUtils'
import { addMonthsISO, monthKey, compareISO, formatDate, todayISO, diffDays } from '../utils/dateUtils'
import { exportCustomers, exportReminders, downloadCSV } from '../utils/excelUtils'

const PIE_COLORS = ['#dc2626', '#d97706', '#0ea5e9', '#059669']

/** Reports & analytics built purely on real saved data. */
export default function Reports() {
  const { customers, reminders, today, settings } = useData()
  const toast = useToast()

  const stats = computeStats(customers, reminders, today)
  const joined = useMemo(() => joinReminders(reminders, customers, today), [reminders, customers, today])

  // Expiry distribution: expired + next 6 months.
  const expiryBuckets = useMemo(() => {
    const buckets = new Map()
    buckets.set('Expired', customers.filter((c) => compareISO(c.pucExpiryDate, today) < 0).length)
    for (let i = 0; i < 6; i++) {
      const start = addMonthsISO(today, i)
      const end = addMonthsISO(today, i + 1)
      const count = customers.filter((c) => compareISO(c.pucExpiryDate, start) >= 0 && compareISO(c.pucExpiryDate, end) < 0).length
      const [y, m] = start.split('-')
      const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      buckets.set(`${labels[Number(m) - 1]} ${y.slice(2)}`, count)
    }
    const later = customers.filter((c) => compareISO(c.pucExpiryDate, addMonthsISO(today, 6)) >= 0).length
    buckets.set('Later', later)
    return Array.from(buckets, ([name, count]) => ({ name, count }))
  }, [customers, today])

  // Reminders by interval and status.
  const intervalData = useMemo(() => {
    return [30, 15, 7].map((iv) => {
      const recs = joined.filter((r) => r.interval === iv)
      return {
        name: `${iv}-day`,
        Due: recs.filter((r) => r.state === 'due_today').length,
        Missed: recs.filter((r) => r.state === 'missed').length,
        Scheduled: recs.filter((r) => r.state === 'scheduled').length,
        Sent: recs.filter((r) => r.state === 'sent').length,
      }
    })
  }, [joined])

  // Confirmed reminders per day for the last 14 days.
  const sentByDay = useMemo(() => {
    const days = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const iso = todayISO(d)
      days.push({
        name: iso.slice(8, 10) + '/' + iso.slice(5, 7),
        Sent: reminders.filter((r) => r.status === 'sent' && r.confirmedAt?.slice(0, 10) === iso).length,
      })
    }
    return days
  }, [reminders])

  // Vehicle type distribution.
  const typeData = useMemo(() => {
    const m = new Map()
    for (const c of customers) m.set(c.vehicleType, (m.get(c.vehicleType) || 0) + 1)
    const colors = ['#0ea5e9', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#65a30d', '#db2777', '#475569']
    return Array.from(m, ([name, count]) => ({ name, count, fill: colors[m.size % colors.length] }))
  }, [customers])

  const exportReport = () => {
    const head = ['Metric', 'Value']
    const body = [
      ['Report date', formatDate(today)],
      ['Total customers', stats.totalCustomers],
      ['Total vehicles', stats.totalVehicles],
      ['Reminders due today', stats.dueToday],
      ['30-day reminders due', stats.due30],
      ['15-day reminders due', stats.due15],
      ['7-day reminders due', stats.due7],
      ['Expired certificates', stats.expired],
      ['Reminders sent today', stats.sentToday],
      ['Pending reminders', stats.pending],
      ['Missed reminders', stats.missed],
    ]
    downloadCSV([head, ...body], 'puc-report.csv')
    toast.success('Report CSV downloaded.')
  }

  const chartAxis = { fill: '#64748b', fontSize: 12 }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-navy-800">
            <BarChart3 className="h-6 w-6 text-brand-600" aria-hidden="true" /> Reports & Exports
          </h1>
          <p className="text-sm text-slate-500">All figures come from your saved records — nothing is estimated.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportReport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Report CSV
          </button>
          <button
            onClick={() => {
              exportCustomers(customers, reminders, today, 'puc-all-customers.xlsx')
              toast.success('All customers exported.')
            }}
            disabled={!customers.length}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" /> Customers Excel
          </button>
          <button
            onClick={() => {
              exportReminders(joined, today, 'puc-all-reminders.xlsx')
              toast.success('Reminder history exported.')
            }}
            disabled={!joined.length}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-navy-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" /> Reminders Excel
          </button>
        </div>
      </div>

      {/* Summary numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ReportNumber label="Registered vehicles" value={stats.totalVehicles} />
        <ReportNumber label="Due by interval (30/15/7)" value={`${stats.due30} / ${stats.due15} / ${stats.due7}`} />
        <ReportNumber label="Pending reminders" value={stats.pending} />
        <ReportNumber label="Missed reminders" value={stats.missed} tone="text-red-600" />
        <ReportNumber label="Expired certificates" value={stats.expired} tone="text-red-600" />
        <ReportNumber label="Sent today" value={stats.sentToday} tone="text-emerald-600" />
        <ReportNumber label="Total reminder records" value={reminders.length} />
        <ReportNumber label="Customers" value={stats.totalCustomers} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Expiry distribution (next 6 months)">
          {customers.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={expiryBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={chartAxis} />
                <YAxis allowDecimals={false} tick={chartAxis} width={30} />
                <Tooltip />
                <Bar dataKey="count" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty />
          )}
        </ChartCard>

        <ChartCard title="Reminders by interval & status">
          {joined.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={intervalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={chartAxis} />
                <YAxis allowDecimals={false} tick={chartAxis} width={30} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Due" fill="#d97706" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Missed" fill="#dc2626" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Scheduled" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Sent" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty />
          )}
        </ChartCard>

        <ChartCard title="Confirmed reminders — last 14 days">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={sentByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={chartAxis} />
              <YAxis allowDecimals={false} tick={chartAxis} width={30} />
              <Tooltip />
              <Line type="monotone" dataKey="Sent" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Vehicles by type">
          {typeData.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={typeData} dataKey="count" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {typeData.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty />
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function ReportNumber({ label, value, tone = 'text-navy-800' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <h2 className="mb-3 text-sm font-semibold text-navy-800">{title}</h2>
      {children}
    </section>
  )
}

function ChartEmpty() {
  return <p className="flex h-[280px] items-center justify-center text-sm text-slate-400">No data yet — add customers to see this chart.</p>
}
