import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { downloadBackup, freshState, loadState, migrateBackupToState, readBackupFile } from '../utils/storageUtils'
import { syncReminders } from '../utils/reminderUtils'
import { canonicalVehicleNumber, vehicleKey } from '../utils/excelUtils'
import { normalizeMobile } from '../utils/phoneUtils'
import { formatDate, todayISO } from '../utils/dateUtils'
import { buildSampleData } from '../utils/sampleData'
import { mergeImportedCustomers } from '../utils/customerImportUtils'
import { checkAuthorizedUser, isSupabaseConfigured, loadCloudState, saveCloudState, supabase, unlockWithPin } from '../utils/supabaseClient'

const DataContext = createContext(null)
const MAX_ACTIVITY = 300
const LOCAL_MIGRATION_KEY = 'puc_center_manager_cloud_migration_v1'

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

function validateCustomerInput(input, existingCustomers, excludeId = null) {
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

function makeInitialState(cloud) {
  const base = freshState()
  const savedSettings = cloud.settings || {}
  base.settings = {
    ...base.settings,
    ...savedSettings,
    templates: {
      ...base.settings.templates,
      ...(savedSettings.templates || {}),
      bodies: { ...base.settings.templates.bodies, ...(savedSettings.templates?.bodies || {}) },
    },
  }
  return {
    ...base,
    customers: cloud.customers,
    reminders: cloud.reminders,
    activity: cloud.activity,
  }
}

export function DataProvider({ children }) {
  const [state, setState] = useState(freshState)
  const [revision, setRevision] = useState(0)
  const [authStatus, setAuthStatus] = useState(isSupabaseConfigured ? 'checking' : 'config')
  const [user, setUser] = useState(null)
  const [authError, setAuthError] = useState('')
  const [databaseError, setDatabaseError] = useState('')
  const [localMigrationAvailable, setLocalMigrationAvailable] = useState(false)
  const [migrationBusy, setMigrationBusy] = useState(false)
  const [today, setToday] = useState(() => todayISO())
  const userIdRef = useRef(null)
  const loadSequence = useRef(0)

  const initializeUser = useCallback(async (userId) => {
    const sequence = ++loadSequence.current
    userIdRef.current = userId
    setAuthStatus('loadingData')
    setAuthError('')
    setDatabaseError('')
    try {
      const authorized = await checkAuthorizedUser()
      if (sequence !== loadSequence.current) return
      if (!authorized) {
        setAuthStatus('unauthorized')
        return
      }

      const [cloud, local] = await Promise.all([loadCloudState(), Promise.resolve(loadState())])
      if (sequence !== loadSequence.current) return
      setState(makeInitialState(cloud))
      setRevision(cloud.revision)
      const migrationDone = window.localStorage.getItem(LOCAL_MIGRATION_KEY) === 'done'
      setLocalMigrationAvailable(!migrationDone && (local.customers.length > 0 || local.reminders.length > 0))
      setAuthStatus('ready')
    } catch (error) {
      if (sequence !== loadSequence.current) return
      setAuthError(error.message || 'Could not load your data from Supabase.')
      setAuthStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      const nextUser = session?.user || null
      setUser(nextUser)
      setAuthError('')
      setDatabaseError('')
      if (nextUser) {
        void initializeUser(nextUser.id)
      } else {
        loadSequence.current += 1
        userIdRef.current = null
        setState(freshState())
        setRevision(0)
        setAuthStatus('signedOut')
      }
    })

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setAuthError(error.message)
        setAuthStatus('error')
        return
      }
      const sessionUser = data.session?.user || null
      setUser(sessionUser)
      if (sessionUser) void initializeUser(sessionUser.id)
      else setAuthStatus('signedOut')
    }).catch((error) => {
      if (!active) return
      setAuthError(error.message || 'Could not check your Supabase sign-in.')
      setAuthStatus('error')
    })

    return () => {
      active = false
      subscription.unsubscribe()
      loadSequence.current += 1
    }
  }, [initializeUser])

  useEffect(() => {
    const timer = setInterval(() => {
      setToday((prev) => (prev === todayISO() ? prev : todayISO()))
    }, 30000)
    return () => clearInterval(timer)
  }, [])

  const commitState = useCallback(async (next) => {
    const committingUserId = userIdRef.current
    if (!committingUserId || authStatus !== 'ready') {
      setDatabaseError('You are not connected to the database. Your change was not saved.')
      return false
    }
    try {
      const nextRevision = await saveCloudState(next, revision)
      if (userIdRef.current !== committingUserId) return false
      setState(next)
      setRevision(nextRevision)
      setDatabaseError('')
      return true
    } catch (error) {
      setDatabaseError(error.message || 'Could not save your change to Supabase. Your previous data is unchanged.')
      return false
    }
  }, [authStatus, revision])

  useEffect(() => {
    if (authStatus !== 'ready') return
    const reminders = syncReminders(state.customers, state.reminders, state.settings, todayISO())
    if (reminders !== state.reminders) void commitState({ ...state, reminders })
  }, [authStatus, state, commitState])

  const unlock = useCallback(async (pin) => {
    if (!supabase) return { error: 'Supabase is not configured.' }
    try {
      return await unlockWithPin(pin)
    } catch (error) {
      return { error: error.message || 'Could not verify the PIN. Check your internet connection and try again.' }
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setAuthError(error.message)
  }, [])

  const retryLoad = useCallback(async () => {
    if (user?.id) {
      await initializeUser(user.id)
      return
    }
    if (!supabase) return
    setAuthStatus('checking')
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        setAuthError(error.message)
        setAuthStatus('error')
      } else if (data.session?.user) {
        setUser(data.session.user)
        await initializeUser(data.session.user.id)
      } else {
        setAuthStatus('signedOut')
      }
    } catch (error) {
      setAuthError(error.message || 'Could not check your Supabase sign-in.')
      setAuthStatus('error')
    }
  }, [initializeUser, user])

  const addCustomer = useCallback(async (input, { allowDuplicate = false } = {}) => {
    const check = validateCustomerInput(input, state.customers)
    if (Object.keys(check.errors).length) return { ok: false, errors: check.errors }
    if (check.duplicateOf) {
      if (!allowDuplicate) return { ok: false, duplicateOf: check.duplicateOf }
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
      const next = {
        ...state,
        customers,
        activity: withActivity(state, 'customer_updated', `Updated existing vehicle ${check.normalized.vehicleNumber} (${check.normalized.name})`),
      }
      return (await commitState(next)) ? { ok: true, updated: true, id: check.duplicateOf.id } : { ok: false, error: 'Customer update failed.' }
    }
    const now = new Date().toISOString()
    const customer = {
      id: uid('c'),
      ...check.normalized,
      vehicleType: input.vehicleType || 'Other',
      email: String(input.email ?? '').trim(),
      address: String(input.address ?? '').trim(),
      isSample: false,
      createdAt: now,
      updatedAt: now,
    }
    const next = {
      ...state,
      customers: [...state.customers, customer],
      activity: withActivity(state, 'customer_added', `Added customer ${customer.name} (${customer.vehicleNumber})`),
    }
    return (await commitState(next)) ? { ok: true, id: customer.id, customer } : { ok: false, error: 'Customer could not be saved.' }
  }, [commitState, state])

  const updateCustomer = useCallback(async (id, input, { allowDuplicate = false } = {}) => {
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
    const saved = await commitState({ ...state, customers, activity: withActivity(state, 'customer_updated', note) })
    return saved ? { ok: true, id, expiryChanged } : { ok: false, error: 'Customer could not be updated.' }
  }, [commitState, state])

  const deleteCustomer = useCallback(async (id) => {
    const customer = state.customers.find((c) => c.id === id)
    const next = {
      ...state,
      customers: state.customers.filter((c) => c.id !== id),
      activity: withActivity(state, 'customer_deleted', `Deleted customer ${customer?.name ?? ''} (${customer?.vehicleNumber ?? ''}) — reminder history kept for audit`),
    }
    return commitState(next)
  }, [commitState, state])

  const importRecords = useCallback(async (records, mode = 'skip') => {
    const { customers, summary } = mergeImportedCustomers(state.customers, records, mode, () => uid('c'))
    const next = {
      ...state,
      customers,
      activity: withActivity(state, 'import', `Import: ${summary.total} rows — ${summary.imported} added, ${summary.updated} updated, ${summary.skipped} duplicates skipped, ${summary.invalid} invalid`),
    }
    return (await commitState(next)) ? { ...summary, ok: true } : { ...summary, ok: false, error: 'Import was not saved. Check the database error and try again.' }
  }, [commitState, state])

  const updateReminder = useCallback(async (id, transform, activityType, activityText) => {
    const reminder = state.reminders.find((item) => item.id === id)
    if (!reminder) return false
    const reminders = state.reminders.map((item) => item.id === id ? transform(item) : item)
    const next = { ...state, reminders, activity: activityText ? withActivity(state, activityType, activityText) : state.activity }
    return commitState(next)
  }, [commitState, state])

  const markReminderSent = useCallback((id, note = '', message = null) => {
    const rec = state.reminders.find((r) => r.id === id)
    if (!rec) return Promise.resolve(false)
    const customer = state.customers.find((c) => c.id === rec.customerId)
    return updateReminder(
      id,
      (r) => ({ ...r, status: 'sent', confirmedAt: new Date().toISOString(), message: message ?? r.message, notes: note ? joinNote(r.notes, note) : r.notes }),
      'reminder_sent',
      `Confirmed sent: ${rec.interval}-day reminder for ${customer?.vehicleNumber ?? rec.vehicleNumber}`
    )
  }, [state.customers, state.reminders, updateReminder])

  const recordWhatsAppOpen = useCallback((id, message = '') => {
    const rec = state.reminders.find((r) => r.id === id)
    if (!rec) return Promise.resolve(false)
    const customer = state.customers.find((c) => c.id === rec.customerId)
    return updateReminder(
      id,
      (r) => ({ ...r, openedAt: new Date().toISOString(), message: message || r.message }),
      'whatsapp_opened',
      `WhatsApp opened: ${rec.interval}-day reminder for ${customer?.vehicleNumber ?? rec.vehicleNumber} (not yet confirmed)`
    )
  }, [state.customers, state.reminders, updateReminder])

  const saveReminderMessage = useCallback((id, message) => updateReminder(id, (r) => ({ ...r, message })), [updateReminder])

  const skipReminder = useCallback((id) => {
    const rec = state.reminders.find((r) => r.id === id)
    return updateReminder(id, (r) => ({ ...r, status: 'skipped', notes: joinNote(r.notes, 'Skipped by owner') }), 'reminder_skipped', `Skipped ${rec?.interval}-day reminder for ${rec?.vehicleNumber ?? ''}`)
  }, [state.reminders, updateReminder])

  const cancelReminder = useCallback((id) => {
    const rec = state.reminders.find((r) => r.id === id)
    return updateReminder(id, (r) => ({ ...r, status: 'cancelled', notes: joinNote(r.notes, 'Cancelled by owner') }), 'reminder_cancelled', `Cancelled ${rec?.interval}-day reminder for ${rec?.vehicleNumber ?? ''}`)
  }, [state.reminders, updateReminder])

  const resetReminder = useCallback((id) => {
    const rec = state.reminders.find((r) => r.id === id)
    return updateReminder(
      id,
      (r) => ({ ...r, status: 'pending', openedAt: null, confirmedAt: null, notes: joinNote(r.notes, 'Manually reset to pending by owner') }),
      'reminder_reset',
      `Reset ${rec?.interval}-day reminder for ${rec?.vehicleNumber ?? ''} so it can be prepared again`
    )
  }, [state.reminders, updateReminder])

  const updateSettings = useCallback((patch) => {
    const next = { ...state, settings: { ...state.settings, ...patch }, activity: withActivity(state, 'settings', 'Settings updated') }
    return commitState(next)
  }, [commitState, state])

  const addActivity = useCallback((type, text) => commitState({ ...state, activity: withActivity(state, type, text) }), [commitState, state])

  const restoreFromBackup = useCallback(async (file) => {
    const res = await readBackupFile(file)
    if (!res.ok) return res
    const restored = migrateBackupToState(res.backup)
    const saved = await commitState(restored)
    return saved ? { ok: true, customers: restored.customers.length } : { ok: false, error: 'Backup could not be saved to Supabase.' }
  }, [commitState])

  const clearAll = useCallback(() => {
    const next = {
      ...freshState(),
      settings: state.settings,
      activity: [{ id: uid('a'), type: 'clear', text: 'All customer data cleared', at: new Date().toISOString() }],
    }
    return commitState(next)
  }, [commitState, state.settings])

  const clearSamples = useCallback(() => {
    const removed = state.customers.filter((c) => c.isSample).length
    const next = {
      ...state,
      customers: state.customers.filter((c) => !c.isSample),
      activity: withActivity(state, 'clear', `Removed ${removed} sample record(s)`),
    }
    return commitState(next)
  }, [commitState, state])

  const loadSamples = useCallback(() => {
    const existing = new Set(state.customers.map((c) => vehicleKey(c.vehicleNumber)))
    const additions = buildSampleData().filter((c) => !existing.has(vehicleKey(c.vehicleNumber)))
    return commitState({
      ...state,
      customers: [...state.customers, ...additions],
      activity: withActivity(state, 'sample', `Loaded ${additions.length} sample record(s)`),
    })
  }, [commitState, state])

  const backupNow = useCallback(async () => {
    downloadBackup(state)
    await addActivity('backup', 'JSON backup downloaded')
  }, [addActivity, state])

  const migrateLocalData = useCallback(async () => {
    setMigrationBusy(true)
    try {
      const local = loadState()
      const byVehicle = new Map(state.customers.map((customer) => [vehicleKey(customer.vehicleNumber), customer]))
      const customerIds = new Set(state.customers.map((customer) => customer.id))
      const customerIdMap = new Map()
      const customers = [...state.customers]
      let imported = 0
      let duplicates = 0
      let invalid = 0
      for (const customer of local.customers) {
        const key = vehicleKey(customer.vehicleNumber)
        if (!customer.name || !customer.mobile || !key || !customer.pucExpiryDate) {
          invalid += 1
          continue
        }
        const existing = byVehicle.get(key)
        if (existing) {
          customerIdMap.set(customer.id, existing.id)
          duplicates += 1
          continue
        }
        const migratedCustomer = customerIds.has(customer.id) ? { ...customer, id: uid('c') } : customer
        customerIdMap.set(customer.id, migratedCustomer.id)
        customerIds.add(migratedCustomer.id)
        customers.push(migratedCustomer)
        byVehicle.set(key, migratedCustomer)
        imported += 1
      }
      const reminderIds = new Set(state.reminders.map((reminder) => reminder.id))
      const reminders = [...state.reminders]
      for (const reminder of local.reminders) {
        if (!reminderIds.has(reminder.id)) {
          const migratedReminder = {
            ...reminder,
            customerId: customerIdMap.get(reminder.customerId) || reminder.customerId,
          }
          reminders.push(migratedReminder)
          reminderIds.add(migratedReminder.id)
        }
      }
      const activityIds = new Set(state.activity.map((entry) => entry.id))
      const activity = [...state.activity]
      for (const entry of local.activity) {
        if (!activityIds.has(entry.id)) {
          activity.push(entry)
          activityIds.add(entry.id)
        }
      }
      const next = {
        ...state,
        customers,
        reminders,
        activity: withActivity({ ...state, activity }, 'migration', `Local data migration: ${imported} customers added, ${duplicates} duplicates skipped`),
        settings: state.customers.length === 0 && !state.activity.length ? local.settings : state.settings,
      }
      if (await commitState(next)) {
        window.localStorage.setItem(LOCAL_MIGRATION_KEY, 'done')
        setLocalMigrationAvailable(false)
        return { ok: true, imported, duplicates, invalid }
      }
      return { ok: false }
    } finally {
      setMigrationBusy(false)
    }
  }, [commitState, state])

  const fmtDate = useCallback((iso) => formatDate(iso, state.settings.dateFormat), [state.settings.dateFormat])
  const getCustomer = useCallback((id) => state.customers.find((c) => c.id === id) || null, [state.customers])

  const value = useMemo(() => ({
    state,
    settings: state.settings,
    customers: state.customers,
    reminders: state.reminders,
    activity: state.activity,
    today,
    storageWarning: Boolean(databaseError),
    databaseError,
    authStatus,
    authError,
    user,
    unlock,
    signOut,
    retryLoad,
    localMigrationAvailable,
    migrationBusy,
    migrateLocalData,
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
  }), [
    state, today, databaseError, authStatus, authError, user, unlock, signOut, retryLoad,
    localMigrationAvailable, migrationBusy, migrateLocalData, fmtDate, getCustomer, addCustomer,
    updateCustomer, deleteCustomer, importRecords, markReminderSent, recordWhatsAppOpen,
    saveReminderMessage, skipReminder, cancelReminder, resetReminder, updateSettings, addActivity,
    restoreFromBackup, clearAll, clearSamples, loadSamples, backupNow,
  ])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}
