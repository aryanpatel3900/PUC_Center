import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  autoMapColumns,
  detectHeaderRow,
  parseRows,
  templateRows,
  vehicleKey,
  FIELDS,
  normalizeHeader,
  analyzeSheet,
  analyzeWorkbook,
  readWorkbook,
  canonicalVehicleNumber,
  isDataRow,
  detectColumnsByValues,
} from '../excelUtils'
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

/* ------------------------------------------------------------------ */
/* Smart importer: header normalisation, aliases, header-row search,   */
/* extra columns, value detection, blank rows, multi-sheet workbooks.  */
/* ------------------------------------------------------------------ */

describe('Smart header detection & mapping', () => {
  it('normalizes header punctuation, case, underscores and dots', () => {
    expect(normalizeHeader('MOBILE NO.')).toBe('mobile no')
    expect(normalizeHeader('Customer_Name')).toBe('customer name')
    expect(normalizeHeader('mobile-number')).toBe('mobile number')
    expect(normalizeHeader('  Reg. No.  ')).toBe('reg no')
    expect(normalizeHeader('e-mail')).toBe('e mail')
    expect(normalizeHeader('PUC  Expiry   Date')).toBe('puc expiry date')
  })

  it('maps a wide range of real-world header aliases', () => {
    const cases = [
      ['Client Name', 'name'],
      ['Full Name', 'name'],
      ['Name of Customer', 'name'],
      ['Customer_Name', 'name'],
      ['નામ', 'name'],
      ['WhatsApp', 'mobile'],
      ['WhatsApp Number', 'mobile'],
      ['Contact Number', 'mobile'],
      ['Phone No', 'mobile'],
      ['મોબાઇલ નંબર', 'mobile'],
      ['Reg No', 'vehicleNumber'],
      ['Reg. No.', 'vehicleNumber'],
      ['Vehicle RC No', 'vehicleNumber'],
      ['RC Number', 'vehicleNumber'],
      ['Car Number', 'vehicleNumber'],
      ['ગાડી નંબર', 'vehicleNumber'],
      ['Valid Till', 'pucExpiryDate'],
      ['Expiration Date', 'pucExpiryDate'],
      ['PUC Valid Till', 'pucExpiryDate'],
      ['માન્ય તારીખ', 'pucExpiryDate'],
      ['Category', 'vehicleType'],
      ['Class', 'vehicleType'],
    ]
    for (const [header, field] of cases) {
      const m = autoMapColumns([header, 'x', 'y', 'z'])
      expect(m[field], `header "${header}" should map to ${field}`).toBe(0)
    }
  })

  it('ignores extra columns like Insurance Expiry, Notes and Amount', () => {
    const m = autoMapColumns(['Name', 'Mobile', 'Vehicle No', 'Insurance Expiry', 'Notes', 'Amount'])
    expect(m.name).toBe(0)
    expect(m.mobile).toBe(1)
    expect(m.vehicleNumber).toBe(2)
    // Insurance Expiry must NOT be mistaken for the PUC expiry date.
    expect(m.pucExpiryDate).toBe(-1)
  })

  it('maps columns in any order', () => {
    const m = autoMapColumns(['PUC Expiry', 'Vehicle Number', 'Mobile Number', 'Customer Name'])
    expect(m).toMatchObject({ pucExpiryDate: 0, vehicleNumber: 1, mobile: 2, name: 3 })
  })

  it('finds a header row deep inside title rows (more than 5 rows down)', () => {
    const rows = [
      ['Shree Ganesh PUC Center'],
      ['Report generated: 24/10/2026'],
      [],
      ['Sr', 'Notes'],
      ['Customer Name', 'Mobile No.', 'Vehicle Reg No', 'Valid Till', 'Type'],
      ['Rahul Patel', '9876543210', 'GJ01AB1234', '30/12/2026', 'Car'],
    ]
    expect(detectHeaderRow(rows)).toBe(4)
  })

  it('imports a realistic messy sheet: title rows, extra columns, stray rows', () => {
    const rows = [
      ['PUC Center Report'],
      [],
      ['Client Name', 'WhatsApp Number', 'Vehicle Reg No', 'Valid Till', 'Insurance Expiry', 'Notes'],
      ['Rahul Patel', '9876543210', 'GJ01AB1234', '30/12/2026', '01/01/2027', 'call evening'],
      ['', '', '', '', '', 'orphan note'], // stray content only in an unmapped column
      ['Amit Shah', '9123456780', 'GJ01CD5678', '15/12/2026', '01/01/2027', ''],
    ]
    const a = analyzeSheet(rows)
    expect(a.headerRow).toBe(2)
    expect(a.mapping).toMatchObject({ name: 0, mobile: 1, vehicleNumber: 2, pucExpiryDate: 3 })
    expect(a.mapping.pucExpiryDate).not.toBe(4) // Insurance Expiry must not steal the mapping
    const parsed = parseRows(rows, a.headerRow, a.mapping, [])
    expect(parsed).toHaveLength(2) // stray row ignored, not counted as invalid
    expect(parsed.every((r) => r.valid)).toBe(true)
  })

  it('detects columns from the data when there is no header row at all', () => {
    const rows = [
      ['Rahul Patel', '9876543210', 'GJ01AB1234', '30/12/2026'],
      ['Amit Shah', '9123456780', 'GJ01CD5678', '15/12/2026'],
      ['Jayesh Patel', '9988776655', 'GJ05EF3690', '01/01/2027'],
    ]
    const a = analyzeSheet(rows)
    expect(a.headerRow).toBe(-1)
    expect(a.method).toBe('values')
    expect(a.requiredFound).toBe(4)
    expect(a.mapping).toMatchObject({ name: 0, mobile: 1, vehicleNumber: 2, pucExpiryDate: 3 })
    const parsed = parseRows(rows, a.headerRow, a.mapping, [])
    expect(parsed).toHaveLength(3)
    expect(parsed.every((r) => r.valid)).toBe(true)
    expect(parsed[0].pucExpiryDate).toBe('2026-12-30')
  })

  it('value detection does not claim a phone column as dates or plates', () => {
    const rows = [
      ['Rahul', '9876543210', 'GJ01AB1234', '30/12/2026'],
      ['Amit', '9123456780', 'GJ01CD5678', '15/12/2026'],
    ]
    const detected = detectColumnsByValues(rows)
    expect(detected.mobile).toBe(1)
    expect(detected.vehicleNumber).toBe(2)
    expect(detected.pucExpiryDate).toBe(3)
    expect(detected.name).toBe(0)
  })
})

describe('Blank rows & precise validation', () => {
  it('ignores blank and formatting-only rows instead of reporting them as invalid', () => {
    const rows = [['Customer Name', 'Mobile', 'Vehicle Number', 'PUC Expiry Date']]
    for (let i = 0; i < 300; i++) {
      rows.push([`Customer ${i}`, `98765${String(10000 + i)}`, `GJ01AB${1000 + i}`, '30/12/2026'])
      rows.push([]) // completely blank row
      rows.push(['', '', '', '']) // blank row with empty strings
      rows.push(['   ', null, undefined, ' ']) // whitespace / empty cells
    }
    const parsed = parseRows(rows, 0, autoMapColumns(rows[0]), [])
    expect(parsed).toHaveLength(300)
    expect(parsed.every((r) => r.valid)).toBe(true)
  })

  it('a sheet with 5000 rows but only 300 customers yields 300 records, not 4700 errors', () => {
    const rows = [['Customer Name', 'Mobile', 'Vehicle Number', 'PUC Expiry Date']]
    for (let i = 0; i < 300; i++) rows.push([`Customer ${i}`, `98765${String(10000 + i)}`, `GJ01AB${1000 + i}`, '30/12/2026'])
    for (let i = 0; i < 4700; i++) rows.push(['', '', '', ''])
    const parsed = parseRows(rows, 0, autoMapColumns(rows[0]), [])
    expect(parsed).toHaveLength(300)
    expect(parsed.filter((r) => !r.valid)).toHaveLength(0)
  })

  it('reports only the actually missing field for partial rows', () => {
    const rows = [
      ['Customer Name', 'Mobile', 'Vehicle Number', 'PUC Expiry Date'],
      ['Rahul Patel', '9876543210', 'GJ01AB1234', ''], // only expiry missing
      ['Amit Shah', '', 'GJ01CD5678', '15/12/2026'], // only mobile missing
    ]
    const parsed = parseRows(rows, 0, autoMapColumns(rows[0]), [])
    expect(parsed).toHaveLength(2)
    expect(parsed[0].errors).toEqual(['Expiry date is missing'])
    expect(parsed[1].errors).toEqual(['Mobile number is missing'])
  })

  it('reports the real Excel row number when the sheet starts below row 1', () => {
    const rows = [
      ['Customer Name', 'Mobile', 'Vehicle Number', 'PUC Expiry Date'],
      ['No Mobile', '', 'GJ01AB1234', '30/12/2026'],
    ]
    const parsed = parseRows(rows, 0, autoMapColumns(rows[0]), [], 4) // sheet range started at Excel row 5
    expect(parsed[0].rowNum).toBe(6) // 1-based Excel row number
    expect(parsed[0].valid).toBe(false)
  })

  it('isDataRow requires a value in at least one required mapped column', () => {
    const mapping = { name: 0, mobile: 1, vehicleNumber: 2, vehicleType: -1, pucExpiryDate: 3, email: -1, address: 4 }
    expect(isDataRow(['A', '', '', ''], mapping)).toBe(true)
    expect(isDataRow(['', '9876543210', '', ''], mapping)).toBe(true)
    expect(isDataRow(['', '', '', ''], mapping)).toBe(false)
    expect(isDataRow([], mapping)).toBe(false)
    expect(isDataRow(['', '', '', '', 'only address'], mapping)).toBe(false) // stray unmapped content only
  })
})

describe('Duplicate detection', () => {
  it('detects duplicate vehicle numbers within the file itself', () => {
    const rows = [
      ['Customer Name', 'Mobile', 'Vehicle Number', 'PUC Expiry Date'],
      ['First Owner', '9876543210', 'GJ01AB1234', '30/12/2026'],
      ['Second Owner', '9123456780', 'GJ01 AB 1234', '15/12/2026'],
    ]
    const parsed = parseRows(rows, 0, autoMapColumns(rows[0]), [])
    expect(parsed[0].duplicate).toBeNull()
    expect(parsed[1].duplicate).toBeTruthy()
    expect(parsed[1].duplicate.reason).toMatch(/earlier row/i)
  })

  it('flags same name + mobile on a different vehicle as a possible duplicate (never blocked)', () => {
    const existing = [{ id: 'c1', name: 'Rahul Patel', mobile: '9876543210', vehicleNumber: 'GJ01AB1234', pucExpiryDate: '2026-05-01' }]
    const rows = [
      ['Customer Name', 'Mobile', 'Vehicle Number', 'PUC Expiry Date'],
      ['Rahul Patel', '+91 987654 3210', 'GJ01ZZ5555', '30/12/2026'],
    ]
    const parsed = parseRows(rows, 0, autoMapColumns(rows[0]), existing)
    expect(parsed[0].duplicate).toBeNull() // different vehicle → not a strong duplicate
    expect(parsed[0].possibleDuplicate).toMatch(/Same name/i)
    expect(parsed[0].valid).toBe(true) // still imported
  })

  it('treats spaced, dashed and compact vehicle numbers as the same vehicle', () => {
    expect(vehicleKey('GJ 01 AB 1234')).toBe(vehicleKey('GJ01AB1234'))
    expect(vehicleKey('gj01ab1234')).toBe('GJ01AB1234')
    expect(canonicalVehicleNumber('  gj   01 ab-1234 ')).toBe('GJ 01 AB-1234')
  })
})

describe('Real-world Excel & CSV formats', () => {
  it('parses mobile numbers from Excel numeric cells and scientific notation', () => {
    const rows = [
      ['Customer Name', 'Mobile', 'Vehicle Number', 'PUC Expiry Date'],
      ['Numeric Cell', 9876543210, 'GJ01AA1111', '30/12/2026'],
      ['Sci Notation', '9.87654321E+9', 'GJ01AA2222', '30/12/2026'],
      ['Float Display', '9876543210.0', 'GJ01AA3333', '30/12/2026'],
      ['Prefixed', '0 98765 43210', 'GJ01AA4444', '30/12/2026'],
      ['Dashed 91', '91-9876543210', 'GJ01AA5555', '30/12/2026'],
    ]
    const parsed = parseRows(rows, 0, autoMapColumns(rows[0]), [])
    for (const r of parsed) {
      expect(r.mobile, `row ${r.rowNum}`).toBe('9876543210')
      expect(r.valid, `row ${r.rowNum}`).toBe(true)
    }
  })

  it('parses dates from Excel serial numbers, text serials and common formats', () => {
    const rows = [
      ['Customer Name', 'Mobile', 'Vehicle Number', 'PUC Expiry Date'],
      ['Serial Number', '9876543210', 'GJ01AA1111', 46023], // Excel serial → 2026-01-01
      ['Serial Text', '9876543210', 'GJ01AA2222', '46023'],
      ['ISO', '9876543210', 'GJ01AA3333', '2026-12-05'],
      ['Slash ISO', '9876543210', 'GJ01AA4444', '2026/12/05'],
      ['Dot Indian', '9876543210', 'GJ01AA5555', '05.01.2027'],
      ['Datetime', '9876543210', 'GJ01AA6666', '24/10/2026 00:00:00'],
      ['ISO Datetime', '9876543210', 'GJ01AA7777', '2026-10-24 12:00:00'],
      ['US Only Valid One Way', '9876543210', 'GJ01AA8888', '12/25/2026'],
      ['Two Digit Year', '9876543210', 'GJ01AA9999', '30/12/26'],
    ]
    const parsed = parseRows(rows, 0, autoMapColumns(rows[0]), [])
    const byName = Object.fromEntries(parsed.map((r) => [r.name, r]))
    expect(byName['Serial Number'].pucExpiryDate).toBe('2026-01-01')
    expect(byName['Serial Text'].pucExpiryDate).toBe('2026-01-01')
    expect(byName['ISO'].pucExpiryDate).toBe('2026-12-05')
    expect(byName['Slash ISO'].pucExpiryDate).toBe('2026-12-05')
    expect(byName['Dot Indian'].pucExpiryDate).toBe('2027-01-05')
    expect(byName['Datetime'].pucExpiryDate).toBe('2026-10-24')
    expect(byName['ISO Datetime'].pucExpiryDate).toBe('2026-10-24')
    expect(byName['US Only Valid One Way'].pucExpiryDate).toBe('2026-12-25')
    expect(byName['US Only Valid One Way'].ambiguousDate).toBe(false)
    expect(byName['Two Digit Year'].pucExpiryDate).toBe('2026-12-30')
    expect(parsed.every((r) => r.valid)).toBe(true)
  })

  it('rejects a bare year instead of turning it into a 1905 date', () => {
    const rows = [
      ['Customer Name', 'Mobile', 'Vehicle Number', 'PUC Expiry Date'],
      ['Bare Year', '9876543210', 'GJ01AA1111', '2026'],
    ]
    const parsed = parseRows(rows, 0, autoMapColumns(rows[0]), [])
    expect(parsed[0].valid).toBe(false)
    expect(parsed[0].errors.join(' ')).toMatch(/date/i)
  })
})

describe('Multi-sheet workbooks', () => {
  it('auto-selects the sheet that contains customer data', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Summary'], ['Total customers', 3]]), 'Summary')
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Customer Name', 'Mobile', 'Vehicle Number', 'PUC Expiry Date'],
        ['Rahul Patel', '9876543210', 'GJ01AB1234', '30/12/2026'],
        ['Amit Shah', '9123456780', 'GJ01CD5678', '15/12/2026'],
      ]),
      'Customers'
    )
    const { sheets, bestIndex, candidateCount } = analyzeWorkbook(wb)
    expect(sheets).toHaveLength(2)
    expect(candidateCount).toBe(1) // only one sheet looks like customer data
    expect(sheets[bestIndex].name).toBe('Customers')
    expect(sheets[bestIndex].requiredFound).toBe(4)
    expect(sheets[bestIndex].dataRowCount).toBe(2)
  })

  it('marks several customer sheets as candidates so the UI can show a selector', () => {
    const wb = XLSX.utils.book_new()
    const header = ['Customer Name', 'Mobile', 'Vehicle Number', 'PUC Expiry Date']
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ['A B', '9876543210', 'GJ01AA1111', '30/12/2026']]), 'January')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ['C D', '9123456780', 'GJ01AA2222', '15/12/2026']]), 'February')
    const { candidateCount } = analyzeWorkbook(wb)
    expect(candidateCount).toBe(2)
  })

  it('reports no candidate sheet for a file without customer data', () => {
    const wb = XLSX.read('Item,Price\nApple,10\nBanana,20', { type: 'string' })
    const { candidateCount, sheets } = analyzeWorkbook(wb)
    expect(candidateCount).toBe(0)
    expect(sheets[0].requiredFound).toBeLessThan(4)
  })

  it('gives a friendly error for a corrupted file', async () => {
    const fake = { arrayBuffer: async () => new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 1, 2, 3]).buffer }
    await expect(readWorkbook(fake)).rejects.toThrow(/could not be read/i)
  })

  it('gives a friendly error for an empty file', async () => {
    await expect(readWorkbook({ arrayBuffer: async () => new ArrayBuffer(0) })).rejects.toThrow(/empty/i)
  })
})

describe('Original failing file (4384 rows)', () => {
  it('imports valid rows and reports only the one actually missing field', () => {
    // Reproduces the real-world sheet that used to fail with
    // "4384 record(s) need correction and will NOT be imported":
    // title rows above the headers, extra columns, and some partial rows.
    const rows = [
      ['PUC Expiry Report - October 2026'],
      [],
      ['S.No', 'Owner Name', 'Contact No', 'Vehicle Reg. No', 'Valid Upto', 'Insurance Expiry', 'Remarks'],
    ]
    const total = 4384
    const incomplete = 384 // rows missing only the mobile number
    for (let i = 0; i < total; i++) {
      const mobile = i < total - incomplete ? String(9876500000 + i).slice(0, 10) : ''
      rows.push([i + 1, `Customer ${i}`, mobile, `GJ01AB${String(1000 + (i % 9000))}`, '30/12/2026', '01/01/2027', ''])
    }

    const a = analyzeSheet(rows)
    expect(a.headerRow).toBe(2)
    expect(a.requiredFound).toBe(4)
    expect(a.dataRowCount).toBe(total)

    const parsed = parseRows(rows, a.headerRow, a.mapping, [])
    expect(parsed).toHaveLength(total)
    const valid = parsed.filter((r) => r.valid)
    const invalid = parsed.filter((r) => !r.valid)
    expect(valid).toHaveLength(total - incomplete)
    expect(invalid).toHaveLength(incomplete)

    // Precise, single-field errors — nobody reports all four errors any more.
    for (const r of invalid) expect(r.errors).toEqual(['Mobile number is missing'])
    // Insurance Expiry was never mapped onto the PUC expiry field.
    expect(a.mapping.pucExpiryDate).not.toBe(5)
    expect(valid[0].pucExpiryDate).toBe('2026-12-30')
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
