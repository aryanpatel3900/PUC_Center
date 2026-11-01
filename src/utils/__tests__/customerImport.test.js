import { describe, expect, it } from 'vitest'
import { mergeImportedCustomers } from '../customerImportUtils'

const record = {
  valid: true,
  name: 'Ramesh Patel',
  mobile: '9876543210',
  vehicleNumber: 'GJ01 AB-1234',
  vehicleType: 'Car',
  pucExpiryDate: '2027-01-30',
  email: '',
  address: '',
}

describe('persistent customer import merging', () => {
  it('does not add the same vehicle again when the same file is imported twice', () => {
    const first = mergeImportedCustomers([], [record], 'skip', () => 'new-customer', '2026-11-01T00:00:00.000Z')
    const second = mergeImportedCustomers(first.customers, [record], 'skip', () => 'should-not-be-used', '2026-11-02T00:00:00.000Z')

    expect(first.summary).toMatchObject({ imported: 1, skipped: 0, invalid: 0 })
    expect(second.summary).toMatchObject({ imported: 0, skipped: 1, invalid: 0 })
    expect(second.customers).toHaveLength(1)
    expect(second.customers[0].id).toBe('new-customer')
  })

  it('updates an existing normalized vehicle only when update mode is selected', () => {
    const existing = [{ ...record, id: 'existing', name: 'Old name', vehicleNumber: 'GJ01AB1234', email: 'old@example.com' }]
    const result = mergeImportedCustomers(existing, [record], 'update', () => 'unused', '2026-11-02T00:00:00.000Z')

    expect(result.summary).toMatchObject({ imported: 0, updated: 1, skipped: 0 })
    expect(result.customers).toHaveLength(1)
    expect(result.customers[0]).toMatchObject({ id: 'existing', name: 'Ramesh Patel', email: 'old@example.com' })
  })

  it('counts invalid spreadsheet rows and does not create records for them', () => {
    const result = mergeImportedCustomers([], [{ ...record, valid: false }], 'skip', () => 'unused')
    expect(result.summary).toMatchObject({ imported: 0, invalid: 1, needsCorrection: 1 })
    expect(result.customers).toHaveLength(0)
  })
})
