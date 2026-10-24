import { useRef, useState } from 'react'
import {
  Building2,
  BellRing,
  Database,
  Palette,
  Save,
  Download,
  Upload,
  FileSpreadsheet,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Users,
  HardDrive,
} from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { downloadTemplate, exportCustomers, exportReminders } from '../utils/excelUtils'
import { defaultTemplates, PLACEHOLDER_HELP, buildMessage } from '../utils/messageTemplates'
import { DEFAULT_INTERVALS } from '../utils/reminderUtils'
import { storageAvailable } from '../utils/storageUtils'

/** Settings: center info, reminder options, message templates, data tools. */
export default function Settings() {
  const { settings, updateSettings, customers, reminders, today, backupNow, restoreFromBackup, clearAll, clearSamples, loadSamples } = useData()
  const toast = useToast()
  const restoreInput = useRef(null)

  const [form, setForm] = useState({ ...settings })
  const [tab, setTab] = useState('center')
  const [confirmClear, setConfirmClear] = useState(false)
  const [restoreInfo, setRestoreInfo] = useState(null)

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const setTemplate = (key, value) =>
    setForm((f) => ({
      ...f,
      templates: key.startsWith('bodies.')
        ? { ...f.templates, bodies: { ...f.templates.bodies, [key.split('.')[1]]: value } }
        : { ...f.templates, [key]: value },
    }))

  const save = () => {
    updateSettings({
      centerName: form.centerName.trim() || 'PUC Center',
      contactNumber: form.contactNumber.trim(),
      address: form.address.trim(),
      openingHours: form.openingHours.trim(),
      showMissed: Boolean(form.showMissed),
      allowCatchUp: Boolean(form.allowCatchUp),
      defaultReminderTab: form.defaultReminderTab,
      dateFormat: form.dateFormat,
      pageSize: Number(form.pageSize) || 25,
      templates: form.templates,
    })
    toast.success('Settings saved.')
  }

  const onRestore = async (file) => {
    if (!file) return
    const res = await restoreFromBackup(file)
    if (res.ok) {
      toast.success(`Backup restored — ${res.customers.length} customers loaded.`)
      setRestoreInfo(null)
    } else {
      toast.error(res.error)
    }
    if (restoreInput.current) restoreInput.current.value = ''
  }

  const sampleCustomer = {
    name: 'રમેશ પટેલ',
    vehicleNumber: 'GJ01AB1234',
    pucExpiryDate: '2026-12-30',
  }

  const previewText = buildMessage({ interval: 30, customer: sampleCustomer, settings: form })

  const TABS = [
    { key: 'center', label: 'Center', icon: Building2 },
    { key: 'reminders', label: 'Reminders', icon: BellRing },
    { key: 'templates', label: 'Gujarati Templates', icon: BellRing },
    { key: 'data', label: 'Data', icon: Database },
    { key: 'display', label: 'Display', icon: Palette },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-800">Settings</h1>
          <p className="text-sm text-slate-500">Configure your center, reminders, Gujarati message templates and data.</p>
        </div>
        <button
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <Save className="h-4 w-4" /> Save Settings
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-card" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
              tab === t.key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>

      {/* Center settings */}
      {tab === 'center' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <h2 className="text-base font-semibold text-navy-800">Center Settings</h2>
          <p className="text-sm text-slate-500">The center name appears in the app and inside every Gujarati WhatsApp message.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="PUC Center Name" id="centerName">
              <input id="centerName" value={form.centerName} onChange={(e) => set('centerName', e.target.value)} className={inputCls} placeholder="e.g. Shree PUC Center" />
            </Field>
            <Field label="Contact Number" id="contactNumber">
              <input id="contactNumber" value={form.contactNumber} onChange={(e) => set('contactNumber', e.target.value)} className={inputCls} placeholder="e.g. 98765 43210" inputMode="tel" />
            </Field>
            <Field label="Address" id="address">
              <input id="address" value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} placeholder="e.g. Station Road, Rajkot" />
            </Field>
            <Field label="Opening Hours (optional)" id="openingHours">
              <input id="openingHours" value={form.openingHours} onChange={(e) => set('openingHours', e.target.value)} className={inputCls} placeholder="e.g. 9:00 AM – 8:00 PM" />
            </Field>
          </div>
        </section>
      ) : null}

      {/* Reminder settings */}
      {tab === 'reminders' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <h2 className="text-base font-semibold text-navy-800">Reminder Settings</h2>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-navy-800">Reminder schedule</p>
            <p className="mt-1 text-sm text-slate-500">
              The standard schedule is fixed by default: <strong>30, 15 and 7 days</strong> before the PUC expiry date. Example — for an
              expiry of 30/12/2026, reminders fall on 30/11/2026, 15/12/2026 and 23/12/2026.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(form.reminderIntervals || DEFAULT_INTERVALS).map((iv) => (
                <span key={iv} className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">
                  {iv} days before expiry
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Changing the intervals is an advanced option. Existing reminder history is always preserved — old records stay exactly as they
              are and new cycles use the new schedule.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <Toggle
              id="showMissed"
              label="Show missed reminders"
              description="Display reminders whose scheduled date passed without confirmation in a separate Missed list."
              checked={form.showMissed !== false}
              onChange={(v) => set('showMissed', v)}
            />
            <Toggle
              id="allowCatchUp"
              label="Allow manual catch-up for missed reminders"
              description="Let the owner reset a missed reminder and prepare it again (with a confirmation step)."
              checked={form.allowCatchUp !== false}
              onChange={(v) => set('allowCatchUp', v)}
            />
          </div>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              The app never sends messages by itself. WhatsApp opens with your message prefilled and <strong>you press Send</strong>. Delivery
              cannot be verified by the app — always use “Mark as Sent” only after you actually sent the message.
            </p>
          </div>
        </section>
      ) : null}

      {/* Templates */}
      {tab === 'templates' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-navy-800">Gujarati Message Templates</h2>
              <p className="text-sm text-slate-500">Edit the greeting, each reminder wording and the closing. Placeholders are filled automatically.</p>
            </div>
            <button
              onClick={() => {
                setForm((f) => ({ ...f, templates: defaultTemplates() }))
                toast.info('Templates reset to the default Gujarati wording (not saved yet).')
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-navy-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" /> Reset to Default
            </button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="Greeting" id="t-greeting">
                <textarea id="t-greeting" rows={2} value={form.templates.greeting} onChange={(e) => setTemplate('greeting', e.target.value)} className={areaCls} dir="auto" />
              </Field>
              {[30, 15, 7].map((iv) => (
                <Field key={iv} label={`${iv}-Day Message`} id={`t-body-${iv}`}>
                  <textarea id={`t-body-${iv}`} rows={5} value={form.templates.bodies[iv]} onChange={(e) => setTemplate(`bodies.${iv}`, e.target.value)} className={areaCls} dir="auto" />
                </Field>
              ))}
              <Field label="Closing" id="t-closing">
                <textarea id="t-closing" rows={2} value={form.templates.closing} onChange={(e) => setTemplate('closing', e.target.value)} className={areaCls} dir="auto" />
              </Field>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-navy-800">Available placeholders</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {PLACEHOLDER_HELP.map((p) => (
                    <li key={p.token}>
                      <code className="rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-brand-700">{p.token}</code>{' '}
                      <span className="text-slate-500">— {p.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-900">Live preview (30-day, sample customer)</p>
                <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm leading-6 text-navy-800" dir="auto">
                  {previewText}
                </pre>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Data */}
      {tab === 'data' ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <h2 className="flex items-center gap-2 text-base font-semibold text-navy-800">
              <HardDrive className="h-5 w-5 text-brand-600" aria-hidden="true" /> Data Storage
            </h2>
            {storageAvailable() ? (
              <p className="mt-1 text-sm text-slate-500">
                All {customers.length} customer(s) and {reminders.length} reminder record(s) are saved in <strong>this browser</strong> on this
                computer (localStorage). Data does NOT sync to other computers or browsers, and it is lost if browser storage is cleared — so
                download a JSON backup regularly.
              </p>
            ) : (
              <p className="mt-1 text-sm font-medium text-red-600">
                Browser storage is not available in this browser. The app will not be able to save data — please use a normal browser window.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  backupNow()
                  toast.success('JSON backup downloaded. Keep the file somewhere safe.')
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Download className="h-4 w-4" /> Download JSON Backup
              </button>
              <input
                ref={restoreInput}
                type="file"
                accept=".json"
                className="hidden"
                aria-label="Restore from JSON backup"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) setRestoreInfo({ file, name: file.name })
                }}
              />
              <button
                onClick={() => restoreInput.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-slate-50"
              >
                <Upload className="h-4 w-4" /> Restore from Backup
              </button>
              <button
                onClick={() => {
                  exportCustomers(customers, reminders, today, 'puc-all-customers.xlsx')
                  toast.success('Customers exported to Excel.')
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-slate-50"
              >
                <FileSpreadsheet className="h-4 w-4" /> Export Customers (Excel)
              </button>
              <button
                onClick={() => {
                  exportReminders(reminders.map((r) => ({ ...r, customer: customers.find((c) => c.id === r.customerId) })), today, 'puc-reminders.xlsx')
                  toast.success('Reminder history exported to Excel.')
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-slate-50"
              >
                <FileSpreadsheet className="h-4 w-4" /> Export Reminders (Excel)
              </button>
              <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-slate-50">
                <Download className="h-4 w-4" /> Excel Template
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <h2 className="flex items-center gap-2 text-base font-semibold text-navy-800">
              <Users className="h-5 w-5 text-violet-600" aria-hidden="true" /> Sample Data
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Sample records (marked with a SAMPLE badge) help you try the app. Removing them never touches your real customer records.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={loadSamples} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-slate-50">
                Load Sample Records
              </button>
              <button
                onClick={() => {
                  clearSamples()
                  toast.success('Sample records removed. Real customers were not affected.')
                }}
                className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
              >
                Remove Sample Records
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-card">
            <h2 className="flex items-center gap-2 text-base font-semibold text-red-700">
              <Trash2 className="h-5 w-5" aria-hidden="true" /> Danger Zone
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Delete all customer data and reminder history from this browser. Settings are kept. This cannot be undone — take a backup first.
            </p>
            <button
              onClick={() => setConfirmClear(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" /> Clear All Customer Data
            </button>
          </section>
        </div>
      ) : null}

      {/* Display */}
      {tab === 'display' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <h2 className="text-base font-semibold text-navy-800">Display Settings</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Date format" id="dateFormat">
              <select id="dateFormat" value={form.dateFormat} onChange={(e) => set('dateFormat', e.target.value)} className={inputCls}>
                <option value="DD/MM/YYYY">DD/MM/YYYY (recommended)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </Field>
            <Field label="Rows per page" id="pageSize">
              <select id="pageSize" value={form.pageSize} onChange={(e) => set('pageSize', Number(e.target.value))} className={inputCls}>
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} rows
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default reminder tab" id="defaultReminderTab">
              <select id="defaultReminderTab" value={form.defaultReminderTab} onChange={(e) => set('defaultReminderTab', e.target.value)} className={inputCls}>
                <option value="today">Today's Due</option>
                <option value="30">30-Day</option>
                <option value="15">15-Day</option>
                <option value="7">7-Day</option>
                <option value="missed">Missed</option>
                <option value="all">All Reminders</option>
              </select>
            </Field>
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          clearAll()
          setConfirmClear(false)
          toast.success('All customer data cleared. Settings were kept.')
        }}
        title="Clear ALL customer data?"
        danger
        requireText="DELETE"
        confirmLabel="Delete everything"
        message="Every customer, reminder record and activity entry will be permanently deleted from this browser. Settings are kept. Download a backup first if you may need this data later."
      />

      <ConfirmDialog
        open={Boolean(restoreInfo)}
        onClose={() => setRestoreInfo(null)}
        onConfirm={() => {
          onRestore(restoreInfo.file)
        }}
        title="Restore backup?"
        message={
          restoreInfo ? (
            <p>
              Restore from <strong>{restoreInfo.name}</strong>? This <strong>replaces</strong> all current customers, reminders and history in
              this browser with the backup's contents.
            </p>
          ) : null
        }
        confirmLabel="Restore (replaces current data)"
      />
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-navy-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100'
const areaCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 text-navy-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100'

function Field({ label, id, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-navy-800">
        {label}
      </label>
      {children}
    </div>
  )
}

function Toggle({ id, label, description, checked, onChange }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:bg-slate-50">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 rounded accent-brand-600"
      />
      <span>
        <span className="block text-sm font-semibold text-navy-800">{label}</span>
        <span className="mt-0.5 block text-sm text-slate-500">{description}</span>
      </span>
    </label>
  )
}
