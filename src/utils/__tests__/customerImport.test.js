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

describe('vehicle-number duplicate detection', () => {
  it('treats case, spaces and hyphens as the same vehicle', () => {
    const rows = [
      { ...record, vehicleNumber: 'GJ-01-AB-1234' },
      { ...record, vehicleNumber: 'GJ 01 AB 1234' },
      { ...record, vehicleNumber: 'gj01ab1234' },
    ]
    const result = mergeImportedCustomers([], rows, 'skip', () => 'c1')
    expect(result.summary).toMatchObject({ total: 3, imported: 1, skipped: 2, conflicts: 0, invalid: 0 })
    expect(result.customers).toHaveLength(1)
    expect(result.customers[0].vehicleNumber).toBe('GJ-01-AB-1234') // first row kept
  })

  it('keeps the first valid row and flags conflicting duplicates for review', () => {
    const rows = [
      { ...record, vehicleNumber: 'GJ01AB1234', pucExpiryDate: '2027-01-30' },
      { ...record, vehicleNumber: 'GJ-01-AB-1234', pucExpiryDate: '2027-06-15', name: 'Other Person' },
    ]
    const result = mergeImportedCustomers([], rows, 'skip', () => 'c1')
    expect(result.summary).toMatchObject({ imported: 1, skipped: 0, conflicts: 1 })
    expect(result.customers).toHaveLength(1)
    expect(result.customers[0].pucExpiryDate).toBe('2027-01-30')
    expect(result.customers[0].name).toBe('Ramesh Patel')
    expect(result.summary.conflictList[0]).toMatchObject({ vehicleNumber: 'GJ-01-AB-1234', keptFrom: 'earlier row in this file' })
    expect(result.summary.conflictList[0].fields).toEqual(expect.arrayContaining(['expiry date', 'name']))
  })

  it('never lets a later row overwrite the first row, even in update mode', () => {
    const rows = [
      { ...record, vehicleNumber: 'GJ01AB1234', pucExpiryDate: '2027-01-30' },
      { ...record, vehicleNumber: 'GJ01AB1234', pucExpiryDate: '2027-06-15' },
    ]
    const result = mergeImportedCustomers([], rows, 'update', () => 'c1')
    expect(result.summary).toMatchObject({ imported: 1, updated: 0, skipped: 0, conflicts: 1 })
    expect(result.customers).toHaveLength(1)
    expect(result.customers[0].pucExpiryDate).toBe('2027-01-30')
  })

  it('never creates a second record for a vehicle already in the database', () => {
    const existing = [{ ...record, id: 'e1', vehicleNumber: 'GJ01AB1234' }]
    const incoming = { ...record, vehicleNumber: 'gj 01 ab 1234' } // same vehicle, different formatting

    const skip = mergeImportedCustomers(existing, [incoming], 'skip', () => 'x')
    expect(skip.summary).toMatchObject({ imported: 0, updated: 0, skipped: 1, conflicts: 0 })
    expect(skip.customers).toHaveLength(1)

    const upd = mergeImportedCustomers(existing, [{ ...incoming, pucExpiryDate: '2028-05-05' }], 'update', () => 'x')
    expect(upd.summary).toMatchObject({ imported: 0, updated: 1 })
    expect(upd.customers).toHaveLength(1)
    expect(upd.customers[0].pucExpiryDate).toBe('2028-05-05')
  })

  it('flags differing details against an existing record instead of overwriting (skip mode)', () => {
    const existing = [{ ...record, id: 'e1', vehicleNumber: 'GJ01AB1234', pucExpiryDate: '2027-01-30' }]
    const incoming = { ...record, vehicleNumber: 'GJ01AB1234', pucExpiryDate: '2027-09-09' }
    const result = mergeImportedCustomers(existing, [incoming], 'skip', () => 'x')
    expect(result.summary).toMatchObject({ imported: 0, updated: 0, skipped: 0, conflicts: 1 })
    expect(result.customers[0].pucExpiryDate).toBe('2027-01-30') // existing record kept
    expect(result.summary.conflictList[0]).toMatchObject({ keptFrom: 'existing record' })
  })

  it('never uses the phone number as the deduplication key', () => {
    // Same phone on two different vehicles → both imported.
    const rows = [
      { ...record, vehicleNumber: 'GJ01AB1234', mobile: '9876543210' },
      { ...record, vehicleNumber: 'GJ01CD5678', mobile: '9876543210' },
    ]
    const result = mergeImportedCustomers([], rows, 'skip', () => 'c1')
    expect(result.summary).toMatchObject({ imported: 2, skipped: 0, conflicts: 0 })
    expect(result.customers).toHaveLength(2)

    // Same vehicle with different phones → still one record (first phone kept).
    const rows2 = [
      { ...record, vehicleNumber: 'GJ01AB1234', mobile: '9876543210' },
      { ...record, vehicleNumber: 'GJ01AB1234', mobile: '9000000000' },
    ]
    const result2 = mergeImportedCustomers([], rows2, 'skip', () => 'c1')
    expect(result2.summary).toMatchObject({ imported: 1, skipped: 0, conflicts: 1 })
    expect(result2.customers).toHaveLength(1)
    expect(result2.customers[0].mobile).toBe('9876543210')
  })

  it('treats blank or meaningless vehicle numbers as invalid and never merges them together', () => {
    const rows = [
      { ...record, vehicleNumber: '' },
      { ...record, vehicleNumber: '   ' },
      { ...record, vehicleNumber: '---' },
    ]
    const result = mergeImportedCustomers([], rows, 'skip', () => 'c1')
    expect(result.summary).toMatchObject({ imported: 0, skipped: 0, conflicts: 0, invalid: 3 })
    expect(result.customers).toHaveLength(0)
  })

  it('summary counts add up to the total rows', () => {
    const existing = [{ ...record, id: 'e1', vehicleNumber: 'GJ01AB1234' }]
    const rows = [
      { ...record, vehicleNumber: 'GJ01AB1234' }, // identical to existing → skipped
      { ...record, vehicleNumber: 'gj01 ab 1234', pucExpiryDate: '2028-01-01' }, // differs → conflict
      { ...record, vehicleNumber: 'GJ02XY9999' }, // new → imported
      { ...record, vehicleNumber: 'GJ02XY9999', pucExpiryDate: '2029-01-01' }, // in-file conflict
      { ...record, vehicleNumber: '' }, // invalid
      { ...record, valid: false }, // invalid
    ]
    const result = mergeImportedCustomers(existing, rows, 'skip', () => 'c1')
    const s = result.summary
    expect(s.total).toBe(6)
    expect(s).toMatchObject({ imported: 1, updated: 0, skipped: 1, conflicts: 2, invalid: 2 })
    expect(s.imported + s.updated + s.skipped + s.conflicts + s.invalid).toBe(s.total)
  })
})
