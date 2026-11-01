import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null

export function getSupabaseError(error) {
  if (!error) return 'An unknown database error occurred.'
  if (error.code === '40001') return 'Another authorized device changed the data. Refresh the page to load the latest version, then try again.'
  if (error.code === '23505') return 'A customer with this vehicle number already exists. Refresh the page and try again.'
  if (error.code === 'PGRST116') return 'The requested database record was not found.'
  return error.message || 'Could not connect to Supabase. Check your internet connection and project settings.'
}

export async function checkAuthorizedUser() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('is_authorized_puc_user')
  if (error) throw new Error(getSupabaseError(error))
  return data === true
}

/**
 * Verify the 4-digit PIN with the server-side `puc-unlock` Edge Function.
 * The PIN is checked there against a salted hash stored only in Edge Function
 * secrets; on success the function returns a normal Supabase Auth session for
 * the authorized app account, which we install with setSession(). RLS,
 * the authorized-user allow-list and all data policies stay unchanged.
 */
export async function unlockWithPin(pin) {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return { error: 'Enter all 4 digits of the PIN.' }
  }
  if (!supabase) return { error: 'Supabase is not configured.' }

  let result
  try {
    result = await supabase.functions.invoke('puc-unlock', { body: { pin } })
  } catch {
    return { error: 'Could not reach the unlock service. Check your internet connection and try again.' }
  }

  const { data, error } = result || {}
  if (error) {
    let status = null
    let message = null
    try {
      status = error.status ?? error.context?.status ?? null
      const body = error.context ? await error.context.json() : null
      if (body?.error) message = String(body.error)
    } catch {
      /* keep the generic message below */
    }
    if (status === 404) {
      return { error: 'The unlock service is not deployed yet. Run the PIN setup steps in README.md (deploy the puc-unlock function).' }
    }
    return { error: message || 'Could not verify the PIN. Check your internet connection and try again.' }
  }
  if (data?.error) return { error: String(data.error) }
  if (!data?.access_token || !data?.refresh_token) {
    return { error: 'The unlock service returned an invalid response. Redeploy it and try again.' }
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  })
  if (sessionError) {
    return { error: sessionError.message || 'Could not open your session. Try again.' }
  }
  return { error: null }
}

async function fetchAllRows(table, orderColumn) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderColumn, { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999)
    if (error) throw new Error(getSupabaseError(error))
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

export async function loadCloudState() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data: initialSettings, error: initialSettingsError } = await supabase
    .from('puc_center_settings')
    .select('settings, revision')
    .maybeSingle()
  if (initialSettingsError) throw new Error(getSupabaseError(initialSettingsError))

  const [customers, reminders, activity] = await Promise.all([
    fetchAllRows('puc_customers', 'created_at'),
    fetchAllRows('puc_reminders', 'created_at'),
    supabase.from('puc_activity').select('*').order('at', { ascending: false }).limit(300),
  ])
  if (activity.error) throw new Error(getSupabaseError(activity.error))
  const { data: latestSettings, error: latestSettingsError } = await supabase
    .from('puc_center_settings')
    .select('settings, revision')
    .maybeSingle()
  if (latestSettingsError) throw new Error(getSupabaseError(latestSettingsError))
  if (initialSettings?.revision !== latestSettings?.revision) {
    throw new Error('The data changed on another device while it was loading. Refresh the page and try again.')
  }

  return {
    customers: customers.map((row) => ({
      id: row.id,
      name: row.name,
      mobile: row.mobile,
      vehicleNumber: row.vehicle_number,
      vehicleType: row.vehicle_type,
      pucExpiryDate: row.puc_expiry_date,
      email: row.email || '',
      address: row.address || '',
      isSample: row.is_sample,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    reminders: reminders.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      vehicleNumber: row.vehicle_number,
      cycleExpiry: row.cycle_expiry,
      interval: row.interval_days,
      scheduledDate: row.scheduled_date,
      status: row.status,
      openedAt: row.opened_at,
      confirmedAt: row.confirmed_at,
      message: row.message || '',
      notes: row.notes || '',
      createdAt: row.created_at,
    })),
    activity: activity.data.map((row) => ({
      id: row.id,
      type: row.type,
      text: row.text,
      at: row.at,
    })),
    settings: latestSettings?.settings || null,
    hasSettings: Boolean(latestSettings),
    revision: latestSettings?.revision || 0,
  }
}

export async function saveCloudState(state, revision, importBatch = null) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('save_puc_center_state', {
    p_customers: state.customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      mobile: customer.mobile,
      vehicle_number: customer.vehicleNumber,
      vehicle_type: customer.vehicleType,
      puc_expiry_date: customer.pucExpiryDate,
      email: customer.email || '',
      address: customer.address || '',
      is_sample: Boolean(customer.isSample),
      created_at: customer.createdAt,
      updated_at: customer.updatedAt,
    })),
    p_reminders: state.reminders.map((reminder) => ({
      id: reminder.id,
      customer_id: reminder.customerId,
      vehicle_number: reminder.vehicleNumber,
      cycle_expiry: reminder.cycleExpiry,
      interval_days: reminder.interval,
      scheduled_date: reminder.scheduledDate,
      status: reminder.status,
      opened_at: reminder.openedAt,
      confirmed_at: reminder.confirmedAt,
      message: reminder.message || '',
      notes: reminder.notes || '',
      created_at: reminder.createdAt,
    })),
    p_activity: state.activity.map((entry) => ({
      id: entry.id,
      type: entry.type,
      text: entry.text,
      at: entry.at,
    })),
    p_settings: state.settings,
    p_expected_revision: revision,
    // When this save comes from an Excel import, the database records the
    // batch in the same transaction and computes which customers it created.
    p_import_batch: importBatch
      ? {
          filename: importBatch.filename,
          imported_at: importBatch.importedAt,
          total_rows: importBatch.totalRows,
          imported_count: importBatch.importedCount,
          skipped_count: importBatch.skippedCount,
          conflicts_count: importBatch.conflictsCount,
          invalid_count: importBatch.invalidCount,
        }
      : null,
  })
  if (error) throw new Error(getSupabaseError(error))
  return Number(data)
}

/** All Excel import batches, newest first (read-only; RLS limits them to this center). */
export async function listImportBatches() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('puc_import_batches')
      .select('*')
      .order('imported_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + 999)
    if (error) throw new Error(getSupabaseError(error))
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    importedAt: row.imported_at,
    totalRows: row.total_rows,
    importedCount: row.imported_count,
    skippedCount: row.skipped_count,
    conflictsCount: row.conflicts_count,
    invalidCount: row.invalid_count,
    createdCustomerIds: row.created_customer_ids || [],
  }))
}

/**
 * Delete one import batch: only the customer records that batch created.
 * The database refuses to touch anything else (older/manual records) and
 * refuses edited records unless `force` is set. Returns the RPC result:
 * { revision, deleted_customers, kept_edited }.
 */
export async function deleteImportBatchRpc(batchId, customerIds, force, activityId, activityText) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('delete_puc_import_batch', {
    p_batch_id: batchId,
    p_customer_ids: Array.isArray(customerIds) ? customerIds : null,
    p_force: Boolean(force),
    p_activity_id: activityId || null,
    p_activity_text: activityText || null,
  })
  if (error) throw new Error(getSupabaseError(error))
  return {
    revision: Number(data?.revision) || 0,
    deletedCustomers: Number(data?.deleted_customers) || 0,
    keptEdited: Number(data?.kept_edited) || 0,
  }
}
