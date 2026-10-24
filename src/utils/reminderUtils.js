// Reminder scheduling engine.
//
// Reminder identity = customerId + expiry cycle + interval.
// The same vehicle therefore gets completely independent records for its
// 30-day, 15-day and 7-day reminders, and a renewed PUC expiry creates a brand
// new cycle without disturbing historical records.

import { addDaysISO, compareISO } from './dateUtils'

export const DEFAULT_INTERVALS = [30, 15, 7]

export const STATUS_META = {
  scheduled: { label: 'Scheduled', tone: 'info' },
  due_today: { label: 'Due Today', tone: 'warning' },
  missed: { label: 'Missed', tone: 'danger' },
  sent: { label: 'Sent — Confirmed by Owner', tone: 'success' },
  skipped: { label: 'Skipped', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
}

export function statusLabel(key) {
  return STATUS_META[key]?.label ?? key
}

/** The scheduled date of the N-days-before reminder. */
export function reminderDateFor(expiryISO, interval) {
  return addDaysISO(expiryISO, -interval)
}

/** Unique logical reminder id: vehicle/customer + expiry cycle + interval. */
export function reminderId(customerId, expiryISO, interval) {
  return `${customerId}|${expiryISO}|${interval}`
}

/**
 * Effective status of a stored reminder for a given day.
 * 'sent' / 'skipped' / 'cancelled' are final. Everything else is derived from
 * the scheduled date so day transitions happen automatically — and a manual
 * reset (back to pending) is respected instead of being forced back to Missed.
 */
export function effectiveStatus(record, today) {
  if (!record) return 'scheduled'
  if (record.status === 'sent') return 'sent'
  if (record.status === 'skipped') return 'skipped'
  if (record.status === 'cancelled') return 'cancelled'
  const cmp = compareISO(record.scheduledDate, today)
  if (cmp < 0) return 'missed'
  if (cmp === 0) return 'due_today'
  return 'scheduled'
}

function sameRecord(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  const keys = ['scheduledDate', 'status', 'openedAt', 'confirmedAt', 'message', 'notes', 'vehicleNumber', 'cycleExpiry', 'interval']
  return keys.every((k) => a[k] === b[k])
}

/**
 * Synchronise reminder records with the customer list.
 *
 * - Creates missing records for every (customer, current expiry cycle, interval).
 * - Cancels still-pending records when the PUC expiry date changed (new cycle).
 * - Cancels still-pending records when the customer was deleted.
 * - Never touches confirmed-sent history.
 * - Returns the SAME array reference when nothing changed (to avoid loops).
 */
export function syncReminders(customers, reminders, settings, today) {
  const intervals = Array.isArray(settings?.reminderIntervals) && settings.reminderIntervals.length
    ? settings.reminderIntervals
    : DEFAULT_INTERVALS

  const out = reminders.slice()
  const index = new Map(out.map((r, i) => [r.id, i]))
  let changed = false

  const setAt = (i, patch) => {
    out[i] = { ...out[i], ...patch }
    changed = true
  }

  // 1. Cancel pending reminders of deleted customers (history is preserved).
  const activeIds = new Set(customers.map((c) => c.id))
  for (let i = 0; i < out.length; i++) {
    const r = out[i]
    if (!activeIds.has(r.customerId) && (r.status === 'pending' || r.status === 'scheduled')) {
      setAt(i, { status: 'cancelled', notes: joinNotes(r.notes, 'Cancelled: customer was deleted') })
    }
  }

  // 2. Cancel pending reminders from an older expiry cycle of a live customer.
  const currentCycle = new Map(customers.map((c) => [c.id, c.pucExpiryDate]))
  for (let i = 0; i < out.length; i++) {
    const r = out[i]
    const expiry = currentCycle.get(r.customerId)
    if (!expiry) continue
    const isPending = r.status === 'pending' || r.status === 'scheduled'
    if (isPending && r.cycleExpiry !== expiry) {
      setAt(i, { status: 'cancelled', notes: joinNotes(r.notes, 'Cancelled: PUC expiry date changed to ' + expiry) })
    }
  }

  // 3. Ensure a record exists for every customer + current cycle + interval.
  for (const c of customers) {
    if (!c.pucExpiryDate) continue
    const cycleExpiry = c.pucExpiryDate
    for (const interval of intervals) {
      const id = reminderId(c.id, cycleExpiry, interval)
      const scheduledDate = reminderDateFor(cycleExpiry, interval)
      const i = index.get(id)
      if (i === undefined) {
        out.push({
          id,
          customerId: c.id,
          vehicleNumber: c.vehicleNumber,
          cycleExpiry,
          interval,
          scheduledDate,
          status: 'pending',
          openedAt: null,
          confirmedAt: null,
          message: '',
          notes: '',
          createdAt: new Date().toISOString(),
        })
        changed = true
      } else if (out[i].status === 'pending' || out[i].status === 'scheduled') {
        // Keep details in sync (vehicle re-numbered, interval setting changed).
        if (out[i].scheduledDate !== scheduledDate || out[i].vehicleNumber !== c.vehicleNumber) {
          setAt(i, { scheduledDate, vehicleNumber: c.vehicleNumber })
        }
      }
    }
  }

  return changed ? out : reminders
}

function joinNotes(existing, extra) {
  if (!existing) return extra
  return `${existing} | ${extra}`
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

/** Expiry classification for a customer on a given day. */
export function expiryStatus(customer, today) {
  const cmp = compareISO(customer.pucExpiryDate, today)
  if (cmp < 0) return 'expired'
  if (cmp === 0) return 'expiring_today'
  if (cmp <= 30) return 'expiring_soon'
  return 'upcoming'
}

export const EXPIRY_META = {
  expired: { label: 'Expired', tone: 'danger' },
  expiring_today: { label: 'Expires Today', tone: 'warning' },
  expiring_soon: { label: 'Expiring Soon', tone: 'warning' },
  upcoming: { label: 'Upcoming', tone: 'success' },
}

/** All reminder records for one customer. */
export function remindersForCustomer(reminders, customerId) {
  return reminders
    .filter((r) => r.customerId === customerId)
    .sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1))
}

/** Attach a joined customer to each reminder record (for tables). */
export function joinReminders(reminders, customers, today) {
  const byId = new Map(customers.map((c) => [c.id, c]))
  return reminders
    .map((r) => {
      const customer = byId.get(r.customerId)
      if (!customer) return null
      return { ...r, customer, state: effectiveStatus(r, today) }
    })
    .filter(Boolean)
}

/** Reminder records that are due on exactly `today`. */
export function dueToday(reminders, today) {
  return reminders.filter((r) => effectiveStatus(r, today) === 'due_today')
}

/** Reminder records whose scheduled date passed without confirmation. */
export function missedReminders(reminders, today) {
  return reminders.filter((r) => effectiveStatus(r, today) === 'missed')
}

/** Reminder records scheduled in the future. */
export function upcomingReminders(reminders, today) {
  return reminders.filter((r) => effectiveStatus(r, today) === 'scheduled')
}

export function sentReminders(reminders) {
  return reminders.filter((r) => r.status === 'sent')
}

/** Distinct vehicles counted by their current record. */
export function countVehicles(customers) {
  return new Set(customers.map((c) => c.vehicleNumber)).size
}

/** Dashboard statistics — every number comes from real saved records. */
export function computeStats(customers, reminders, today) {
  const customerIds = new Set(customers.map((c) => c.id))
  const active = reminders.filter((r) => customerIds.has(r.customerId))

  let due30 = 0
  let due15 = 0
  let due7 = 0
  let due = 0
  let missed = 0
  let pending = 0
  const sentToday = reminders.filter(
    (r) => r.status === 'sent' && r.confirmedAt && r.confirmedAt.slice(0, 10) === today
  ).length

  for (const r of active) {
    const st = effectiveStatus(r, today)
    if (st === 'due_today') {
      due += 1
      if (r.interval === 30) due30 += 1
      else if (r.interval === 15) due15 += 1
      else if (r.interval === 7) due7 += 1
    } else if (st === 'missed') {
      missed += 1
    } else if (st === 'scheduled') {
      pending += 1
    }
  }

  const expired = customers.filter((c) => compareISO(c.pucExpiryDate, today) < 0).length

  return {
    totalCustomers: customers.length,
    totalVehicles: countVehicles(customers),
    dueToday: due,
    due30,
    due15,
    due7,
    expired,
    sentToday,
    pending,
    missed,
  }
}
