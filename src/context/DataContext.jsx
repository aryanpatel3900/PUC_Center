import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { loadState, saveState, freshState, downloadBackup, readBackupFile, migrateBackupToState } from '../utils/storageUtils'
import { syncReminders } from '../utils/reminderUtils'
import { canonicalVehicleNumber, vehicleKey } from '../utils/excelUtils'
import { normalizeMobile } from '../utils/phoneUtils'
import { formatDate, todayISO } from '../utils/dateUtils'
import { buildSampleData } from '../utils/sampleData'

const DataContext = createContext(null)

const MAX_ACTIVITY = 300

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function withActivity(state, type, text) {
  const entry = { id: uid('a'), type, text, at: new Date().toISOString() }
  return [entry, ...state.activity].slice(0, MAX_ACTIVITY)
}

function joinNote(existing, extra) {
  return existing ? `${existing} | ${extra}` : extra
}

export function DataProvider({ children }) {
  const [state, setState] = useState(() => loadState())
  const [storageWarning, setStorageWarning] = useState(false)
  const [today, setToday] = useState(() => todayISO())

  // Refresh "today" when the calendar day changes (app left open overnight).
  useEffect(() => {
    const timer = setInterval(() => {
      setToday((prev) => (prev === todayISO() ? prev : todayISO()))
    }, 30000)
    return () => clearInterval(timer)
  }, [])

  // Keep reminder records in step with customers / interval settings.
  useEffect(() => {
    setState((prev) => {
      const next = syncReminders(prev.customers, prev.reminders, prev.settings, todayISO())
      return next === prev.reminders ? prev : { ...prev, reminders: next }
    })
  }, [state.customers, state.settings.reminderIntervals])

  // Persist every change.
  useEffect(() => {
    const ok = saveState(state)
    if (!ok) setStorageWarning(true)
  }, [state])

  /* --------------------------- validation --------------------------- */

  const validateCustomerInput = (input, existingCustomers, excludeId = null) => {
    const errors = {}
    const name = String(input.name ?? '').trim()
    if (!name) errors.name = 'Customer name is required'

    const mobile = normalizeMobile(input.mobile)
    if (!mobile) errors.mobile = 'Enter a valid 10-digit Indian mobile number (starts with 6-9)'

    const vehicleNumber = canonicalVehicleNumber(input.vehicleNumber)
    if (!vehicleNumber) errors.vehicleNumber = 'Vehicle number is required'

    const pucExpiryDate = String(input.pucExpiryDate ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pucExpiryDate)) errors.pucExpiryDate = 'A valid PUC expiry date is required'

    let duplicateOf = null
    if (vehicleNumber && Object.keys(errors).length === 0) {
      duplicateOf = existingCustomers.find((c) => c.id !== excludeId && vehicleKey(c.vehicleNumber) === vehicleKey(vehicleNumber)) || null
    }
    return { errors, duplicateOf, normalized: { name, mobile, vehicleNumber, pucExpiryDate } }
  }

  /* ----------------------------- customers -------------------------- */

  const addCustomer = useCallback(
    (input, { allowDuplicate = false } = {}) => {
      const check = validateCustomerInput(input, state.customers)
      if (Object.keys(check.errors).length) return { ok: false, errors: check.errors }
      if (check.duplicateOf) {
        if (!allowDuplicate) return { ok: false, duplicateOf: check.duplicateOf }
        // Owner chose to update the existing record instead.
        const customers = state.customers.map((c) =>
          c.id === check.duplicateOf.id
            ? {
                ...c,
                ...check.normalized,
                vehicleType: input.vehicleType || c.vehicleType,
                email: String(input.email ?? '').trim() || c.email,
                address: String(input.address ?? '').trim() || c.address,
                isSample: false,
                updatedAt: new Date().toISOString(),
              }
            : c
        )
        const next = { ...state, customers, activity: withActivity(state, 'customer_updated', `Updated existing vehicle ${check.normalized.vehicleNumber} (${check.normalized.name})`) }
        setState(next)
        return { ok: true, updated: true, id: check.duplicateOf.id }
      }
      const customer = {
        id: uid('c'),
        ...check.normalized,
        vehicleType: input.vehicleType || 'Other',
        email: String(input.email ?? '').trim(),
        address: String(input.address ?? '').trim(),
        isSample: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setState({ ...state, customers: [...state.customers, customer], activity: withActivity(state, 'customer_added', `Added customer ${customer.name} (${customer.vehicleNumber})`) })
      return { ok: true, id: customer.id, customer }
    },
    [state]
  )

  const updateCustomer = useCallback(
    (id, input, { allowDuplicate = false } = {}) => {
      const check = validateCustomerInput(input, state.customers, id)
      if (Object.keys(check.errors).length) return { ok: false, errors: check.errors }
      if (check.duplicateOf && !allowDuplicate) return { ok: false, duplicateOf: check.duplicateOf }

      const old = state.customers.find((c) => c.id === id)
      if (!old) return { ok: false, errors: { name: 'Customer not found' } }
      const expiryChanged = old.pucExpiryDate !== check.normalized.pucExpiryDate

      const customers = state.customers.map((c) =>
        c.id === id
          ? {
              ...c,
              ...check.normalized,
              vehicleType: input.vehicleType || c.vehicleType,
              email: String(input.email ?? '').trim(),
              address: String(input.address ?? '').trim(),
              updatedAt: new Date().toISOString(),
            }
          : c
      )
      const note = expiryChanged
        ? `Updated ${check.normalized.vehicleNumber}: expiry ${old.pucExpiryDate} → ${check.normalized.pucExpiryDate} (new reminder cycle created)`
        : `Updated customer ${check.normalized.name} (${check.normalized.vehicleNumber})`
      setState({ ...state, customers, activity: withActivity(state, 'customer_updated', note) })
      return { ok: true, id, expiryChanged }
    },
    [state]
  )

  const deleteCustomer = useCallback(
    (id) => {
      const customer = state.customers.find((c) => c.id === id)
      setState({
        ...state,
        customers: state.customers.filter((c) => c.id !== id),
        activity: withActivity(state, 'customer_deleted', `Deleted customer ${customer?.name ?? ''} (${customer?.vehicleNumber ?? ''}) — reminder history kept for audit`),
      })
    },
    [state]
  )

  /**
   * Import parsed spreadsheet records.
   * mode: 'skip' (leave existing untouched) or 'update' (overwrite existing).
   * Returns the import summary synchronously.
   */
  const importRecords = useCallback(
    (records, mode = 'skip') => {
      const byKey = new Map(state.customers.map((c) => [vehicleKey(c.vehicleNumber), c]))
      const customers = [...state.customers]
      let imported = 0
      let updated = 0
      let skipped = 0
      let invalid = 0

      for (const rec of records) {
        if (!rec.valid) {
          invalid += 1
          continue
        }
        const key = vehicleKey(rec.vehicleNumber)
        const existing = byKey.get(key)
        if (existing) {
          if (mode === 'update') {
            const idx = customers.findIndex((c) => c.id === existing.id)
            customers[idx] = {
              ...customers[idx],
              name: rec.name,
              mobile: rec.mobile,
              vehicleNumber: rec.vehicleNumber,
              vehicleType: rec.vehicleType,
              pucExpiryDate: rec.pucExpiryDate,
              email: rec.email || customers[idx].email,
              address: rec.address || customers[idx].address,
              isSample: false,
              updatedAt: new Date().toISOString(),
            }
            updated += 1
          } else {
            skipped += 1
          }
        } else {
          const created = {
            id: uid('c'),
            name: rec.name,
            mobile: rec.mobile,
            vehicleNumber: rec.vehicleNumber,
            vehicleType: rec.vehicleType,
            pucExpiryDate: rec.pucExpiryDate,
            email: rec.email,
            address: rec.address,
            isSample: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          customers.push(created)
          byKey.set(key, created)
          imported += 1
        }
      }

      const summary = { total: records.length, imported, updated, skipped, invalid, needsCorrection: invalid }
      setState({
        ...state,
        customers,
        activity: withActivity(state, 'import', `Import: ${records.length} rows — ${imported} added, ${updated} updated, ${skipped} duplicates skipped, ${invalid} invalid`),
      })
      return summary
    },
    [state]
  )

  /* ---------------------------- reminders --------------------------- */

  const markReminderSent = useCallback(
    (id, note = '') => {
      const rec = state.reminders.find((r) => r.id === id)
      if (!rec) return
      const customer = state.customers.find((c) => c.id === rec.customerId)
      const reminders = state.reminders.map((r) =>
        r.id === id ? { ...r, status: 'sent', confirmedAt: new Date().toISOString(), notes: note ? joinNote(r.notes, note) : r.notes } : r
      )
      setState({
        ...state,
        reminders,
        activity: withActivity(state, 'reminder_sent', `Confirmed sent: ${rec.interval}-day reminder for ${customer?.vehicleNumber ?? rec.vehicleNumber}`),
      })
    },
    [state]
  )

  const recordWhatsAppOpen = useCallback(
    (id, message = '') => {
      const rec = state.reminders.find((r) => r.id === id)
      if (!rec) return
      const customer = state.customers.find((c) => c.id === rec.customerId)
      const reminders = state.reminders.map((r) => (r.id === id ? { ...r, openedAt: new Date().toISOString(), message: message || r.message } : r))
      setState({
        ...state,
        reminders,
        activity: withActivity(state, 'whatsapp_opened', `WhatsApp opened: ${rec.interval}-day reminder for ${customer?.vehicleNumber ?? rec.vehicleNumber} (not yet confirmed)`),
      })
    },
    [state]
  )

  const saveReminderMessage = useCallback(
    (id, message) => {
      setState({ ...state, reminders: state.reminders.map((r) => (r.id === id ? { ...r, message } : r)) })
    },
    [state]
  )

  const skipReminder = useCallback(
    (id) => {
      const rec = state.reminders.find((r) => r.id === id)
      const reminders = state.reminders.map((r) => (r.id === id ? { ...r, status: 'skipped', notes: joinNote(r.notes, 'Skipped by owner') } : r))
      setState({ ...state, reminders, activity: withActivity(state, 'reminder_skipped', `Skipped ${rec?.interval}-day reminder for ${rec?.vehicleNumber ?? ''}`) })
    },
    [state]
  )

  const cancelReminder = useCallback(
    (id) => {
      const rec = state.reminders.find((r) => r.id === id)
      const reminders = state.reminders.map((r) => (r.id === id ? { ...r, status: 'cancelled', notes: joinNote(r.notes, 'Cancelled by owner') } : r))
      setState({ ...state, reminders, activity: withActivity(state, 'reminder_cancelled', `Cancelled ${rec?.interval}-day reminder for ${rec?.vehicleNumber ?? ''}`) })
    },
    [state]
  )

  /** Manual "prepare again" reset for a missed reminder (owner-confirmed). */
  const resetReminder = useCallback(
    (id) => {
      const rec = state.reminders.find((r) => r.id === id)
      const reminders = state.reminders.map((r) =>
        r.id === id ? { ...r, status: 'pending', openedAt: null, confirmedAt: null, notes: joinNote(r.notes, 'Manually reset to pending by owner') } : r
      )
      setState({
        ...state,
        reminders,
        activity: withActivity(state, 'reminder_reset', `Reset ${rec?.interval}-day reminder for ${rec?.vehicleNumber ?? ''} so it can be prepared again`),
      })
    },
    [state]
  )

  /* ------------------------- settings & data ------------------------ */

  const updateSettings = useCallback(
    (patch) => {
      setState({ ...state, settings: { ...state.settings, ...patch }, activity: withActivity(state, 'settings', 'Settings updated') })
    },
    [state]
  )

  const addActivity = useCallback((type, text) => setState((prev) => ({ ...prev, activity: withActivity(prev, type, text) })), [])

  const restoreFromBackup = useCallback(async (file) => {
    const res = await readBackupFile(file)
    if (!res.ok) return res
    const restored = migrateBackupToState(res.backup)
    setState(restored)
    return { ok: true, customers: restored.customers.length }
  }, [])

  const clearAll = useCallback(() => {
    setState((prev) => ({
      ...freshState(),
      settings: prev.settings,
      activity: [{ id: uid('a'), type: 'clear', text: 'All customer data cleared', at: new Date().toISOString() }],
    }))
  }, [])

  const clearSamples = useCallback(() => {
    setState((prev) => {
      const removed = prev.customers.filter((c) => c.isSample).length
      return { ...prev, customers: prev.customers.filter((c) => !c.isSample), activity: withActivity(prev, 'clear', `Removed ${removed} sample record(s)`) }
    })
  }, [])

  const loadSamples = useCallback(() => {
    setState((prev) => {
      const existing = new Set(prev.customers.map((c) => vehicleKey(c.vehicleNumber)))
      const additions = buildSampleData().filter((c) => !existing.has(vehicleKey(c.vehicleNumber)))
      return { ...prev, customers: [...prev.customers, ...additions], activity: withActivity(prev, 'sample', `Loaded ${additions.length} sample record(s)`) }
    })
  }, [])

  const backupNow = useCallback(() => {
    downloadBackup(state)
    setState((prev) => ({ ...prev, activity: withActivity(prev, 'backup', 'JSON backup downloaded') }))
  }, [state])

  /* ----------------------------- values ----------------------------- */

  const fmtDate = useCallback((iso) => formatDate(iso, state.settings.dateFormat), [state.settings.dateFormat])

  const getCustomer = useCallback((id) => state.customers.find((c) => c.id === id) || null, [state.customers])

  const value = useMemo(
    () => ({
      state,
      settings: state.settings,
      customers: state.customers,
      reminders: state.reminders,
      activity: state.activity,
      today,
      storageWarning,
      fmtDate,
      getCustomer,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      importRecords,
      markReminderSent,
      recordWhatsAppOpen,
      saveReminderMessage,
      skipReminder,
      cancelReminder,
      resetReminder,
      updateSettings,
      addActivity,
      restoreFromBackup,
      clearAll,
      clearSamples,
      loadSamples,
      backupNow,
    }),
    [
      state,
      storageWarning,
      fmtDate,
      getCustomer,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      importRecords,
      markReminderSent,
      recordWhatsAppOpen,
      saveReminderMessage,
      skipReminder,
      cancelReminder,
      resetReminder,
      updateSettings,
      addActivity,
      restoreFromBackup,
      clearAll,
      clearSamples,
      loadSamples,
      backupNow,
    ]
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}
