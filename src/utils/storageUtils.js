// Local storage layer: versioned key, migrations, backup and restore.
//
// Everything stays in the browser's localStorage on this computer. No data is
// ever sent to a server.

import { DEFAULT_INTERVALS, DEFAULT_INTERVALS as IV } from './reminderUtils'
import { defaultTemplates } from './messageTemplates'

export const STORAGE_KEY = 'puc_center_manager_data'
export const STORAGE_VERSION = 1

export function defaultSettings() {
  return {
    centerName: 'PUC Center',
    contactNumber: '',
    address: '',
    openingHours: '',
    reminderIntervals: [...DEFAULT_INTERVALS],
    showMissed: true,
    allowCatchUp: true,
    templates: defaultTemplates(),
    defaultReminderTab: 'today',
    dateFormat: 'DD/MM/YYYY',
    pageSize: 25,
  }
}

export function freshState() {
  return {
    version: STORAGE_VERSION,
    customers: [],
    reminders: [],
    activity: [],
    settings: defaultSettings(),
  }
}

/** True when localStorage is usable in this browser. */
export function storageAvailable() {
  try {
    const k = '__puc_probe__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

/** Merge saved settings over defaults so new options always exist. */
function normalizeSettings(saved) {
  const base = defaultSettings()
  if (!saved || typeof saved !== 'object') return base
  const merged = { ...base, ...saved }
  if (!Array.isArray(merged.reminderIntervals) || !merged.reminderIntervals.length) {
    merged.reminderIntervals = [...IV]
  }
  merged.reminderIntervals = merged.reminderIntervals
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 90)
    .slice(0, 6)
  if (!merged.reminderIntervals.length) merged.reminderIntervals = [...IV]
  merged.templates = { ...base.templates, ...(saved?.templates || {}) }
  merged.templates.bodies = { ...base.templates.bodies, ...(saved?.templates?.bodies || {}) }
  return merged
}

function normalizeCustomer(c, i) {
  return {
    id: typeof c.id === 'string' && c.id ? c.id : `c_${Date.now()}_${i}`,
    name: String(c.name ?? '').trim(),
    mobile: String(c.mobile ?? '').trim(),
    vehicleNumber: String(c.vehicleNumber ?? '').trim().toUpperCase(),
    vehicleType: String(c.vehicleType ?? 'Other'),
    pucExpiryDate: String(c.pucExpiryDate ?? ''),
    email: String(c.email ?? ''),
    address: String(c.address ?? ''),
    isSample: Boolean(c.isSample),
    createdAt: c.createdAt || new Date().toISOString(),
    updatedAt: c.updatedAt || c.createdAt || new Date().toISOString(),
  }
}

function normalizeReminder(r, i) {
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `r_${Date.now()}_${i}`,
    customerId: String(r.customerId ?? ''),
    vehicleNumber: String(r.vehicleNumber ?? ''),
    cycleExpiry: String(r.cycleExpiry ?? ''),
    interval: Number(r.interval) || 0,
    scheduledDate: String(r.scheduledDate ?? ''),
    status: ['pending', 'sent', 'skipped', 'cancelled'].includes(r.status) ? r.status : 'pending',
    openedAt: r.openedAt || null,
    confirmedAt: r.confirmedAt || null,
    message: String(r.message ?? ''),
    notes: String(r.notes ?? ''),
    createdAt: r.createdAt || new Date().toISOString(),
  }
}

function normalizeActivity(a, i) {
  return {
    id: a.id || `a_${Date.now()}_${i}`,
    type: String(a.type || 'info'),
    text: String(a.text || ''),
    at: a.at || new Date().toISOString(),
  }
}

/** Migrate older stored versions to the current shape. */
function migrate(payload) {
  if (!payload || typeof payload !== 'object') return freshState()
  // v0 (no version field) -> v1: same shape, just ensure fields exist.
  const state = freshState()
  state.version = STORAGE_VERSION
  state.customers = Array.isArray(payload.customers) ? payload.customers.map(normalizeCustomer) : []
  state.reminders = Array.isArray(payload.reminders) ? payload.reminders.map(normalizeReminder) : []
  state.activity = Array.isArray(payload.activity) ? payload.activity.slice(0, 500).map(normalizeActivity) : []
  state.settings = normalizeSettings(payload.settings)
  return state
}

const MAX_ACTIVITY_LOCAL = 300

/** Convert a validated backup object into the current app state shape. */
export function migrateBackupToState(backup) {
  const state = migrate(backup?.data)
  state.activity = [
    { id: `a_restore_${Date.now()}`, type: 'restore', text: 'Backup restored', at: new Date().toISOString() },
    ...state.activity,
  ].slice(0, MAX_ACTIVITY_LOCAL)
  return state
}

/** Load state from localStorage. Never throws. */
export function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return freshState()
    const payload = JSON.parse(raw)
    const state = migrate(payload)
    // Persist the migrated shape immediately.
    saveState(state)
    return state
  } catch (e) {
    console.warn('Could not read saved data — starting fresh.', e)
    return freshState()
  }
}

/** Save state. Returns false when storage is full or blocked. */
export function saveState(state) {
  try {
    const payload = {
      version: STORAGE_VERSION,
      customers: state.customers,
      reminders: state.reminders,
      activity: state.activity,
      settings: state.settings,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch (e) {
    console.warn('Could not save data to localStorage.', e)
    return false
  }
}

/** Build the JSON backup object. */
export function createBackup(state) {
  return {
    app: 'puc-center-manager',
    version: STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      customers: state.customers,
      reminders: state.reminders,
      activity: state.activity,
      settings: state.settings,
    },
  }
}

/** Validate a parsed backup before restoring. */
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'This file is not a valid backup.' }
  if (obj.app !== 'puc-center-manager') return { ok: false, error: 'This file was not created by PUC Center Manager.' }
  const data = obj.data
  if (!data || typeof data !== 'object') return { ok: false, error: 'Backup has no data section.' }
  if (!Array.isArray(data.customers)) return { ok: false, error: 'Backup has no customer list.' }
  const bad = data.customers.find((c) => !c || typeof c !== 'object' || !c.vehicleNumber || !c.pucExpiryDate)
  if (bad) return { ok: false, error: 'Backup contains a malformed customer record.' }
  return { ok: true }
}

/** Trigger a JSON file download of the backup. */
export function downloadBackup(state) {
  const backup = createBackup(state)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `puc-center-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return backup
}

/** Read a backup file chosen by the user. */
export async function readBackupFile(file) {
  const text = await file.text()
  let obj
  try {
    obj = JSON.parse(text)
  } catch {
    return { ok: false, error: 'The selected file is not valid JSON.' }
  }
  const check = validateBackup(obj)
  if (!check.ok) return check
  return { ok: true, backup: obj }
}
