import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  BellRing,
  CalendarClock,
  AlertOctagon,
  History,
  BarChart3,
  Settings,
  X,
  Gauge,
  ChevronLeft,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { dueToday, missedReminders } from '../utils/reminderUtils'

const GROUPS = [
  {
    label: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Customers',
    items: [
      { to: '/customers', label: 'Customers', icon: Users },
      { to: '/import', label: 'Import Excel', icon: FileSpreadsheet },
    ],
  },
  {
    label: 'Reminders',
    items: [
      { to: '/reminders', label: 'Reminder Center', icon: BellRing, end: true, badge: 'today' },
      { to: '/reminders?tab=30', label: '30-Day Reminders', icon: CalendarClock },
      { to: '/reminders?tab=15', label: '15-Day Reminders', icon: CalendarClock },
      { to: '/reminders?tab=7', label: '7-Day Reminders', icon: CalendarClock },
      { to: '/reminders?tab=missed', label: 'Missed Reminders', icon: AlertOctagon, badge: 'missed' },
      { to: '/reminders?tab=sent', label: 'Sent History', icon: History },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/reports', label: 'Reports & Exports', icon: BarChart3 },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

function itemActive(item, location) {
  const [path, query] = item.to.split('?')
  if (location.pathname !== path) return false
  if (!query) return true
  return query.split('&').every((pair) => location.search.includes(pair))
}

export default function Sidebar({ mobileOpen, onCloseMobile, collapsed, onToggleCollapsed }) {
  const { reminders, today, settings } = useData()
  const location = useLocation()
  const badges = {
    missed: missedReminders(reminders, today).length,
    today: dueToday(reminders, today).length,
  }

  return (
    <>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-navy-900/40 lg:hidden" onClick={onCloseMobile} aria-hidden="true" />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white transition-all duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-[76px]' : 'lg:w-64'}`}
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-tealx-600 text-white">
            <Gauge className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className={`min-w-0 flex-1 ${collapsed ? 'lg:hidden' : ''}`}>
            <p className="truncate text-sm font-bold text-navy-800">PUC Center Manager</p>
            <p className="truncate text-xs text-slate-500">{settings.centerName || 'PUC Center'}</p>
          </div>
          <button onClick={onCloseMobile} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <p className={`px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${collapsed ? 'lg:hidden' : ''}`}>
                {group.label}
              </p>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const active = itemActive(item, location)
                  const badgeCount = item.badge ? badges[item.badge] : 0
                  return (
                    <li key={item.label}>
                      <Link
                        to={item.to}
                        onClick={onCloseMobile}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                          active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-navy-800'
                        }`}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                        <span className={`flex-1 truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                        {badgeCount > 0 ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white ${
                              item.badge === 'missed' ? 'bg-red-500' : 'bg-amber-500'
                            } ${collapsed ? 'lg:hidden' : ''}`}
                          >
                            {badgeCount}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <button
            onClick={onToggleCollapsed}
            className="hidden w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-navy-800 lg:flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft className={`h-4 w-4 transition ${collapsed ? 'rotate-180' : ''}`} aria-hidden="true" />
            <span className={collapsed ? 'lg:hidden' : ''}>Collapse</span>
          </button>
          <p className={`mt-1 text-center text-[11px] text-slate-400 ${collapsed ? 'lg:hidden' : ''}`}>Data stays on this computer</p>
        </div>
      </aside>
    </>
  )
}
