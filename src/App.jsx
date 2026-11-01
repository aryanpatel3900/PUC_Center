import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AlertTriangle, Delete, Eye, EyeOff, Loader2, LockKeyhole, LogOut, RefreshCw } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import CustomerDetailPage from './pages/CustomerDetailPage'
import ImportPage from './pages/ImportPage'
import ImportHistory from './pages/ImportHistory'
import ReminderCenter from './pages/ReminderCenter'
import History from './pages/History'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import { DataProvider, useData } from './context/DataContext'
import { ToastProvider, useToast } from './context/ToastContext'

const SIDEBAR_KEY = 'puc_sidebar_collapsed'

/** Scroll to top whenever the route changes. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

function Layout() {
  const { localMigrationAvailable, migrationBusy, migrateLocalData } = useData()
  const toast = useToast()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_KEY) === '1'
    } catch {
      return false
    }
  })

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !c
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <div className={`transition-all duration-200 ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-64'}`}>
        <Header onOpenMobile={() => setMobileOpen(true)} />
        {localMigrationAvailable ? (
          <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 sm:mx-6">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>
                Customer data from this browser is available to migrate. It will remain in this browser as a backup; matching vehicle numbers
                already in Supabase will be skipped.
              </p>
            </div>
            <button
              onClick={async () => {
                const result = await migrateLocalData()
                if (result.ok) {
                  toast.success(`Migration saved: ${result.imported} customer(s) added; ${result.duplicates} duplicate(s) skipped; ${result.invalid} invalid record(s) left in the browser backup.`)
                }
                else toast.error('Migration was not saved. Check the database error and try again.')
              }}
              disabled={migrationBusy}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-amber-800 px-3 py-2 font-semibold text-white hover:bg-amber-900 disabled:opacity-60"
            >
              {migrationBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {migrationBusy ? 'Migrating…' : 'Migrate existing data'}
            </button>
          </div>
        ) : null}
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/imports" element={<ImportHistory />} />
            <Route path="/reminders" element={<ReminderCenter />} />
            <Route path="/history" element={<History />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function AuthScreen({ title, message, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-card">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <LockKeyhole className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-navy-800">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        {children}
      </section>
    </div>
  )
}

const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** Minimal 4-digit PIN keypad: Show/Hide, Clear, backspace, Enter. */
function PinUnlock({ busy, onSubmit }) {
  const [pin, setPin] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')

  const canType = !busy && pin.length < 4

  const pressDigit = (digit) => {
    if (!canType) return
    setError('')
    setPin((prev) => (prev + digit).slice(0, 4))
  }
  const clearPin = () => {
    if (busy) return
    setPin('')
    setError('')
  }
  const backspace = () => {
    if (busy) return
    setError('')
    setPin((prev) => prev.slice(0, -1))
  }
  const submit = async () => {
    if (busy) return
    if (pin.length !== 4) {
      setError('Enter all 4 digits of the PIN.')
      return
    }
    setError('')
    const result = await onSubmit(pin)
    if (result?.error) {
      setError(result.error)
      setPin('')
    }
  }

  // Physical keyboard support (digits, Backspace, Enter, Escape to clear).
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key >= '0' && event.key <= '9' && event.key.length === 1) pressDigit(event.key)
      else if (event.key === 'Backspace') backspace()
      else if (event.key === 'Enter') {
        // Handle Enter here only — prevent the form's default submit from
        // firing a second unlock request.
        event.preventDefault()
        void submit()
      } else if (event.key === 'Escape') clearPin()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="flex justify-center gap-3" aria-label={visible ? `PIN: ${pin}` : 'PIN entry'}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`flex h-12 w-11 items-center justify-center rounded-xl border text-xl font-bold text-navy-800 transition ${
              pin.length === i && !busy ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-300'
            }`}
          >
            {pin[i] ? (visible ? pin[i] : '•') : ''}
          </div>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-center text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mx-auto grid w-full max-w-[248px] grid-cols-3 gap-2">
        {PIN_KEYS.map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => pressDigit(digit)}
            disabled={!canType}
            className="rounded-xl border border-slate-200 bg-slate-50 py-3 text-lg font-semibold text-navy-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={clearPin}
          disabled={busy}
          className="rounded-xl border border-slate-200 bg-slate-50 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => pressDigit('0')}
          disabled={!canType}
          className="rounded-xl border border-slate-200 bg-slate-50 py-3 text-lg font-semibold text-navy-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          disabled={busy || pin.length === 0}
          aria-label="Delete last digit"
          className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 py-3 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Delete className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-navy-800 disabled:opacity-40"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          {visible ? 'Hide PIN' : 'Show PIN'}
        </button>
        <button
          type="submit"
          disabled={busy || pin.length !== 4}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {busy ? 'Opening…' : 'Enter'}
        </button>
      </div>

      <p className="text-center text-xs text-slate-400">You can also type the PIN on your keyboard.</p>
    </form>
  )
}

function AuthenticatedApp() {
  const { authStatus, authError, unlock, signOut, retryLoad } = useData()
  const [submitting, setSubmitting] = useState(false)

  const handleUnlock = async (pin) => {
    setSubmitting(true)
    try {
      return await unlock(pin)
    } finally {
      setSubmitting(false)
    }
  }

  if (authStatus === 'config') {
    return (
      <AuthScreen
        title="Connect Supabase"
        message="Add the two Supabase settings to a .env file in the project folder, then restart Vite. The setup steps are in README.md."
      >
        <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-700">VITE_SUPABASE_URL=…{'\n'}VITE_SUPABASE_ANON_KEY=…</pre>
      </AuthScreen>
    )
  }

  if (authStatus === 'checking' || authStatus === 'loadingData') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 rounded-xl bg-white px-5 py-4 text-sm font-medium text-navy-800 shadow-card">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden="true" />
          {authStatus === 'checking' ? 'Checking secure sign-in…' : null}
        </div>
      </div>
    )
  }

  if (authStatus === 'error') {
    return (
      <AuthScreen title="Could not connect to your data" message={authError || 'Check your internet connection and Supabase project settings.'}>
        <button onClick={retryLoad} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
        </button>
      </AuthScreen>
    )
  }

  if (authStatus === 'unauthorized') {
    return (
      <AuthScreen title="This account is not authorized" message="Ask the PUC Center administrator to add this account to the Supabase authorized-user list. No customer data was loaded.">
        <button onClick={() => void signOut()} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-navy-700 hover:bg-slate-50">
          <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
        </button>
      </AuthScreen>
    )
  }

  if (authStatus === 'signedOut') {
    return (
      <AuthScreen title="PUC Center Manager" message="Enter your 4-digit PIN to open the dashboard.">
        <PinUnlock busy={submitting} onSubmit={handleUnlock} />
      </AuthScreen>
    )
  }

  return <Layout />
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <DataProvider>
          <ScrollToTop />
          <AuthenticatedApp />
        </DataProvider>
      </ToastProvider>
    </HashRouter>
  )
}
