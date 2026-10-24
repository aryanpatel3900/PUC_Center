import { describe, it, expect } from 'vitest'
import { reminderDateFor, effectiveStatus, syncReminders, reminderId, computeStats } from '../reminderUtils'

/* Required acceptance tests from the specification:
   TEST 1: expiry 30/12/2026 → 30-day reminder 30/11/2026
   TEST 2: expiry 30/12/2026 → 15-day reminder 15/12/2026
   TEST 3: expiry 30/12/2026 →  7-day reminder 23/12/2026 */

describe('reminder date calculation', () => {
  const expiry = '2026-12-30'

  it('TEST 1: 30-day reminder is exactly 30 days before expiry', () => {
    expect(reminderDateFor(expiry, 30)).toBe('2026-11-30')
  })

  it('TEST 2: 15-day reminder is exactly 15 days before expiry', () => {
    expect(reminderDateFor(expiry, 15)).toBe('2026-12-15')
  })

  it('TEST 3: 7-day reminder is exactly 7 days before expiry', () => {
    expect(reminderDateFor(expiry, 7)).toBe('2026-12-23')
  })
})

describe('reminder status classification', () => {
  it('TEST 4: only reminders whose scheduled date equals today are Due Today', () => {
    expect(effectiveStatus({ status: 'pending', scheduledDate: '2026-10-24' }, '2026-10-24')).toBe('due_today')
    expect(effectiveStatus({ status: 'pending', scheduledDate: '2026-10-23' }, '2026-10-24')).toBe('missed')
    expect(effectiveStatus({ status: 'pending', scheduledDate: '2026-10-25' }, '2026-10-24')).toBe('scheduled')
  })

  it('TEST 5: missed reminders are classified separately from due today', () => {
    const rem = { status: 'pending', scheduledDate: '2026-10-01' }
    expect(effectiveStatus(rem, '2026-10-24')).toBe('missed')
  })

  it('TEST 10: an opened WhatsApp link does NOT mark the reminder sent', () => {
    const rem = { status: 'pending', scheduledDate: '2026-10-24', openedAt: '2026-10-24T09:00:00.000Z' }
    expect(effectiveStatus(rem, '2026-10-24')).toBe('due_today')
  })

  it('sent / skipped / cancelled are final states', () => {
    expect(effectiveStatus({ status: 'sent', scheduledDate: '2020-01-01' }, '2026-10-24')).toBe('sent')
    expect(effectiveStatus({ status: 'skipped', scheduledDate: '2020-01-01' }, '2026-10-24')).toBe('skipped')
    expect(effectiveStatus({ status: 'cancelled', scheduledDate: '2020-01-01' }, '2026-10-24')).toBe('cancelled')
  })
})

describe('syncReminders', () => {
  const settings = { reminderIntervals: [30, 15, 7] }
  const customer = {
    id: 'c1',
    name: 'Rahul Patel',
    mobile: '9876543210',
    vehicleNumber: 'GJ01AB1234',
    pucExpiryDate: '2026-12-30',
  }

  it('creates exactly one record per interval, never duplicates', () => {
    const r1 = syncReminders([customer], [], settings, '2026-10-24')
    expect(r1).toHaveLength(3)
    const r2 = syncReminders([customer], r1, settings, '2026-10-24')
    expect(r2).toBe(r1) // same reference => no changes, no duplicates
    expect(new Set(r1.map((r) => r.id)).size).toBe(3)
  })

  it('TEST 6: confirming the 30-day reminder leaves the 15 and 7-day ones pending', () => {
    const records = syncReminders([customer], [], settings, '2026-11-30')
    const sent = records.map((r) => (r.interval === 30 ? { ...r, status: 'sent', confirmedAt: '2026-11-30T10:00:00.000Z' } : r))
    expect(effectiveStatus(sent.find((r) => r.interval === 30), '2026-11-30')).toBe('sent')
    expect(effectiveStatus(sent.find((r) => r.interval === 15), '2026-11-30')).toBe('scheduled')
    expect(effectiveStatus(sent.find((r) => r.interval === 7), '2026-11-30')).toBe('scheduled')
  })

  it('TEST 7: changing the expiry date cancels pending reminders of the old cycle, keeps sent history, and creates a new cycle', () => {
    const today = '2026-10-24'
    const records = syncReminders([customer], [], settings, today)
    const withSent = records.map((r) => (r.interval === 30 ? { ...r, status: 'sent', confirmedAt: '2026-10-01T08:00:00.000Z' } : r))

    const renewed = { ...customer, pucExpiryDate: '2027-06-30' }
    const after = syncReminders([renewed], withSent, settings, today)

    // Old cycle: the sent 30-day record is preserved for audit.
    const oldSent = after.filter((r) => r.cycleExpiry === '2026-12-30' && r.interval === 30)
    expect(oldSent).toHaveLength(1)
    expect(oldSent[0].status).toBe('sent')
    expect(oldSent[0].confirmedAt).toBe('2026-10-01T08:00:00.000Z')

    // Old cycle: the pending 15 and 7-day records are cancelled.
    const oldPending = after.filter((r) => r.cycleExpiry === '2026-12-30' && r.interval !== 30)
    expect(oldPending.every((r) => r.status === 'cancelled')).toBe(true)

    // New cycle: three fresh records with the new scheduled dates.
    const newCycle = after.filter((r) => r.cycleExpiry === '2027-06-30')
    expect(newCycle).toHaveLength(3)
    expect(newCycle.find((r) => r.interval === 30).scheduledDate).toBe('2027-05-31')
    expect(newCycle.find((r) => r.interval === 15).scheduledDate).toBe('2027-06-15')
    expect(newCycle.find((r) => r.interval === 7).scheduledDate).toBe('2027-06-23')
  })

  it('cancels pending reminders when a customer is deleted, preserving history', () => {
    const today = '2026-10-24'
    const records = syncReminders([customer], [], settings, today)
    const after = syncReminders([], records, settings, today)
    expect(after).toHaveLength(3)
    expect(after.every((r) => r.status === 'cancelled')).toBe(true)
  })

  it('reminder identity is vehicle + expiry cycle + interval', () => {
    expect(reminderId('c1', '2026-12-30', 30)).not.toBe(reminderId('c1', '2026-12-30', 15))
    expect(reminderId('c1', '2026-12-30', 30)).not.toBe(reminderId('c1', '2027-06-30', 30))
  })
})

describe('computeStats', () => {
  it('computes every dashboard number from real records', () => {
    const today = '2026-10-24'
    const customers = [
      { id: 'c1', vehicleNumber: 'GJ01AB1234', pucExpiryDate: '2026-12-30' }, // due30 today (expiry-30 = 2026-11-30? no)
      { id: 'c2', vehicleNumber: 'GJ01CD5678', pucExpiryDate: '2026-11-08' }, // 7-day due today (11/08 - 7 = 11/01? no)
      { id: 'c3', vehicleNumber: 'GJ01EF9012', pucExpiryDate: '2026-09-01' }, // expired
    ]
    const reminders = [
      { id: 'r1', customerId: 'c1', interval: 30, cycleExpiry: '2026-12-30', scheduledDate: '2026-11-30', status: 'pending' },
      { id: 'r2', customerId: 'c1', interval: 15, cycleExpiry: '2026-12-30', scheduledDate: '2026-12-15', status: 'pending' },
      { id: 'r3', customerId: 'c1', interval: 7, cycleExpiry: '2026-12-30', scheduledDate: '2026-12-23', status: 'pending' },
      { id: 'r4', customerId: 'c2', interval: 7, cycleExpiry: '2026-11-08', scheduledDate: '2026-10-24', status: 'pending' }, // due today
      { id: 'r5', customerId: 'c2', interval: 15, cycleExpiry: '2026-11-08', scheduledDate: '2026-10-16', status: 'pending' }, // missed
      { id: 'r6', customerId: 'c3', interval: 30, cycleExpiry: '2026-09-01', scheduledDate: '2026-08-02', status: 'sent', confirmedAt: '2026-08-01T10:00:00.000Z' },
    ]
    const stats = computeStats(customers, reminders, today)
    expect(stats.totalCustomers).toBe(3)
    expect(stats.totalVehicles).toBe(3)
    expect(stats.dueToday).toBe(1)
    expect(stats.due7).toBe(1)
    expect(stats.missed).toBe(1)
    expect(stats.expired).toBe(1)
    expect(stats.pending).toBe(3) // r1, r2, r3 are scheduled in the future
    expect(stats.sentToday).toBe(0) // confirmed on 2026-08-01, not today
  })
})
