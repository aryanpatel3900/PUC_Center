import { describe, expect, it } from 'vitest'
import { isCustomerEditedSince, planBatchDeletion } from '../importHistoryUtils'

const IMPORTED_AT = '2026-11-01T10:00:00.000Z'

function customer(id, overrides = {}) {
  return {
    id,
    name: `Owner ${id}`,
    mobile: '9876543210',
    vehicleNumber: `GJ01${id.toUpperCase()}`,
    vehicleType: 'Car',
    pucExpiryDate: '2027-01-30',
    email: '',
    address: '',
    isSample: false,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    ...overrides,
  }
}

function batch(overrides = {}) {
  return {
    id: 'b1',
    filename: 'customers.xlsx',
    importedAt: IMPORTED_AT,
    totalRows: 5,
    importedCount: 3,
    skippedCount: 1,
    conflictsCount: 0,
    invalidCount: 1,
    createdCustomerIds: ['c1', 'c2', 'c3'],
    ...overrides,
  }
}

describe('planBatchDeletion', () => {
  it('targets only the customers created by that batch — never older or manual records', () => {
    const customers = [
      customer('old1', { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }),
      customer('manual', { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }),
      customer('c1'),
      customer('c2'),
      customer('c3'),
    ]
    const plan = planBatchDeletion(customers, [], batch())

    expect(plan.targetIds.sort()).toEqual(['c1', 'c2', 'c3'])
    expect(plan.targetIds).not.toContain('old1')
    expect(plan.targetIds).not.toContain('manual')
    expect(plan.editedIds).toEqual([])
    expect(plan.deletable).toBe(true)
  })

  it('never deletes a pre-existing customer that an import skipped as a duplicate', () => {
    // The vehicle of "preExisting" already existed when the file was
    // imported, so it was skipped and is NOT part of the batch's created ids.
    const preExisting = customer('preExisting', { createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z' })
    const customers = [preExisting, customer('c1')]
    const plan = planBatchDeletion(customers, [], batch({ createdCustomerIds: ['c1'] }))

    expect(plan.targetIds).toEqual(['c1'])
    expect(plan.targetIds).not.toContain('preExisting')
  })

  it('keeps records edited after the import unless includeEdited is set', () => {
    const customers = [
      customer('c1'),
      customer('c2', { updatedAt: '2026-11-01T12:00:00.000Z' }), // edited 2h after import
      customer('c3'),
    ]

    const safe = planBatchDeletion(customers, [], batch())
    expect(safe.editedIds).toEqual(['c2'])
    expect(safe.targetIds.sort()).toEqual(['c1', 'c3'])

    const forced = planBatchDeletion(customers, [], batch(), { includeEdited: true })
    expect(forced.targetIds.sort()).toEqual(['c1', 'c2', 'c3'])
  })

  it('treats a record saved at exactly the import time as NOT edited', () => {
    const customers = [customer('c1', { updatedAt: IMPORTED_AT })]
    expect(isCustomerEditedSince(customers[0], IMPORTED_AT)).toBe(false)
    expect(planBatchDeletion(customers, [], batch()).editedIds).toEqual([])
    expect(isCustomerEditedSince(customer('c1', { updatedAt: '2026-11-01T10:00:01.000Z' }), IMPORTED_AT)).toBe(true)
  })

  it('counts reminders linked to the target customers (kept for audit)', () => {
    const customers = [customer('c1'), customer('c2')]
    const reminders = [
      { id: 'r1', customerId: 'c1' },
      { id: 'r2', customerId: 'c2' },
      { id: 'r3', customerId: 'someone-else' },
      { id: 'r4', customerId: 'c1' },
    ]
    const plan = planBatchDeletion(customers, reminders, batch({ createdCustomerIds: ['c1', 'c2'] }))
    expect(plan.linkedReminders).toBe(3)
  })

  it('handles records that were already deleted and empty batches', () => {
    const customers = [customer('c1')]
    const plan = planBatchDeletion(customers, [], batch({ createdCustomerIds: ['c1', 'c2', 'c3'] }))
    expect(plan.targetIds).toEqual(['c1'])
    expect(plan.missingIds.sort()).toEqual(['c2', 'c3'])

    const empty = planBatchDeletion(customers, [], batch({ createdCustomerIds: [] }))
    expect(empty.targetIds).toEqual([])
    expect(empty.deletable).toBe(false)
    expect(empty.editedIds).toEqual([])
  })

  it('does not blow up on malformed dates (treats them as not edited)', () => {
    const customers = [customer('c1', { updatedAt: 'not-a-date' })]
    const plan = planBatchDeletion(customers, [], batch({ createdCustomerIds: ['c1'], importedAt: '' }))
    expect(plan.editedIds).toEqual([])
    expect(plan.targetIds).toEqual(['c1'])
  })
})
