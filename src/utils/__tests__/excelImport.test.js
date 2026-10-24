import { describe, it, expect } from 'vitest'
import { autoMapColumns, detectHeaderRow, parseRows, templateRows, vehicleKey, FIELDS } from '../excelUtils'
import { validateBackup, createBackup, defaultSettings, freshState } from '../storageUtils'

/* TEST 12 (part 1): Excel column mapping, parsing, duplicate detection. */

describe('Excel import parsing', () => {
  it('auto-maps common column name variants', () => {
    const headers = ['Owner Name', 'Phone', 'Vehicle No', 'Vehicle Type', 'Valid Until']
    const m = autoMapColumns(headers)
    expect(m.name).toBe(0)
    expect(m.mobile).toBe(1)
    expect(m.vehicleNumber).toBe(2)
    expect(m.vehicleType).toBe(3)
    expect(m.pucExpiryDate).toBe(4)
  })

  it('auto-maps the official template headers', () => {
    const rows = templateRows()
    const m = autoMapColumns(rows[0])
    // The template contains the required columns; email/address are optional
    // and intentionally absent, so only require the rest to be mapped.
    for (const f of FIELDS.filter((f) => f.required || f.key === 'vehicleType')) {
      expect(m[f.key], `${f.key} should be mapped`).toBeGreaterThanOrEqual(0)
    }
    expect(m.email).toBe(-1)
    expect(m.address).toBe(-1)
  })

  it('detects a header row that is not the first row', () => {
    const rows = [
      ['Shop report - generated October 2026'],
      ['Name', 'Mobile Number', 'Vehicle Number', 'PUC Expiry Date'],
      ['Rahul Patel', '9876543210', 'GJ01AB1234', '30/12/2026'],
    ]
    const hRow = detectHeaderRow(rows)
    expect(hRow).toBe(1)
    const parsed = parseRows(rows, hRow, autoMapColumns(rows[hRow]), [])
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({ name: 'Rahul Patel', mobile: '9876543210', vehicleNumber: 'GJ01AB1234', pucExpiryDate: '2026-12-30', valid: true })
  })

  it('validates rows and reports specific errors', () => {
    const rows = [
      ['Customer Name', 'Mobile', 'Vehicle Number', 'PUC Expiry Date'],
      ['Bad Phone', '12345', 'GJ01XX1111', '30/12/2026'],
      ['', '9876543210', 'GJ01XX2222', '30/12/2026'],
      ['No Date', '9876543210', 'GJ01XX3333', 'hello'],
    ]
    const parsed = parseRows(rows, 0, autoMapColumns(rows[0]), [])
    expect(parsed[0].valid).toBe(false)
    expect(parsed[0].errors.join(' ')).toMatch(/mobile/i)
    expect(parsed[1].valid).toBe(false)
    expect(parsed[1].errors.join(' ')).toMatch(/name/i)
    expect(parsed[2].valid).toBe(false)
    expect(parsed[2].errors.join(' ')).toMatch(/date/i)
  })

  it('detects duplicate vehicle numbers regardless of case, spaces or dashes', () => {
    const existing = [{ id: 'c9', name: 'Old Owner', vehicleNumber: 'GJ01AB1234', pucExpiryDate: '2026-05-01' }]
    const rows = [
      ['Customer Name', 'Mobile', 'Vehicle Number', 'PUC Expiry Date'],
      ['New Owner', '9876543210', 'gj01 ab-1234', '30/12/2026'],
      ['Another', '9123456780', 'GJ02ZZ9999', '30/12/2026'],
    ]
    const parsed = parseRows(rows, 0, autoMapColumns(rows[0]), existing)
    expect(parsed[0].duplicate).toBeTruthy()
    expect(parsed[0].duplicate.id).toBe('c9')
    expect(parsed[0].vehicleNumber).toBe('GJ01 AB-1234') // display form preserved
    expect(vehicleKey('gj01 ab-1234')).toBe(vehicleKey('GJ01AB1234'))
    expect(parsed[1].duplicate).toBeNull()
  })

  it('flags ambiguous dates instead of silently choosing', () => {
    const rows = [
      ['Customer Name', 'Mobile', 'Vehicle Number', 'PUC Expiry Date'],
      ['Ambiguous', '9876543210', 'GJ01AA1111', '05/04/2026'],
      ['Clear', '9876543210', 'GJ01AA2222', '25/12/2026'],
    ]
    const parsed = parseRows(rows, 0, autoMapColumns(rows[0]), [])
    expect(parsed[0].ambiguousDate).toBe(true)
    expect(parsed[0].pucExpiryDate).toBe('2026-04-05') // day/month convention
    expect(parsed[1].ambiguousDate).toBe(false)
  })

  it('parses the template sample rows as valid records', () => {
    const rows = templateRows()
    const parsed = parseRows(rows, 0, autoMapColumns(rows[0]), [])
    expect(parsed).toHaveLength(2)
    expect(parsed.every((r) => r.valid)).toBe(true)
    expect(parsed[0].pucExpiryDate).toBe('2026-12-30')
    expect(parsed[1].pucExpiryDate).toBe('2026-12-15')
  })
})

/* TEST 12 (part 2): JSON backup validation. */

describe('JSON backup & restore validation', () => {
  const goodState = {
    ...freshState(),
    customers: [
      {
        id: 'c1',
        name: 'Rahul Patel',
        mobile: '9876543210',
        vehicleNumber: 'GJ01AB1234',
        vehicleType: 'Car',
        pucExpiryDate: '2026-12-30',
        email: '',
        address: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  }

  it('creates a backup that validates as restorable', () => {
    const backup = createBackup(goodState)
    expect(backup.app).toBe('puc-center-manager')
    expect(validateBackup(backup)).toEqual({ ok: true })
    // Round trip through JSON (as the file download / restore does).
    const roundTripped = JSON.parse(JSON.stringify(backup))
    expect(validateBackup(roundTripped)).toEqual({ ok: true })
  })

  it('rejects files that are not PUC Center Manager backups', () => {
    expect(validateBackup(null).ok).toBe(false)
    expect(validateBackup({ hello: 'world' }).ok).toBe(false)
    expect(validateBackup({ app: 'other-app', data: { customers: [] } }).ok).toBe(false)
    expect(validateBackup({ app: 'puc-center-manager' }).ok).toBe(false)
  })

  it('rejects backups with malformed customer records', () => {
    const bad = createBackup(goodState)
    bad.data.customers.push({ name: 'No vehicle or date' })
    const res = validateBackup(bad)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/malformed/i)
  })

  it('default settings include the 30/15/7 schedule', () => {
    expect(defaultSettings().reminderIntervals).toEqual([30, 15, 7])
  })
})
