// Excel / CSV import and export built on SheetJS (xlsx).
// All parsing happens in the browser — files never leave the computer.

import * as XLSX from 'xlsx'
import { parseDateValue } from './dateUtils'
import { normalizeMobile } from './phoneUtils'
import { effectiveStatus, statusLabel } from './reminderUtils'
import { formatDate } from './dateUtils'

/* ------------------------------------------------------------------ */
/* Header mapping                                                       */
/* ------------------------------------------------------------------ */

export const FIELDS = [
  { key: 'name', label: 'Customer Name', required: true },
  { key: 'mobile', label: 'Mobile Number', required: true },
  { key: 'vehicleNumber', label: 'Vehicle Number', required: true },
  { key: 'vehicleType', label: 'Vehicle Type', required: false },
  { key: 'pucExpiryDate', label: 'PUC Expiry Date', required: true },
  { key: 'email', label: 'Email (optional)', required: false },
  { key: 'address', label: 'Address (optional)', required: false },
]

const HEADER_ALIASES = {
  name: ['customer name', 'name', 'owner name', 'customer', 'owner', 'cust name', 'ગ્રાહક નામ', 'naam'],
  mobile: ['mobile', 'mobile number', 'phone', 'phone number', 'mobile no', 'phone no', 'contact', 'contact number', 'contact no', 'મોબાઇલ', 'મોબાઇલ નંબર'],
  vehicleNumber: ['vehicle number', 'vehicle no', 'vehicle', 'registration number', 'reg no', 'reg. no', 'registration', 'rc number', 'car number', 'vehicle#', 'વાહન નંબર'],
  vehicleType: ['vehicle type', 'type', 'vehicle category', 'category', 'વાહન પ્રકાર'],
  pucExpiryDate: ['puc expiry date', 'expiry date', 'puc expiry', 'valid until', 'expiry', 'puc upto', 'valid upto', 'validity', 'puc date', 'મુદત'],
  email: ['email', 'e-mail', 'email address', 'mail'],
  address: ['address', 'addr', 'location', 'સરનામું'],
}

export const VEHICLE_TYPES = ['Bike', 'Car', 'Auto', 'Bus', 'Truck', 'Jeep', 'Taxi', 'Tempo', 'Other']

function normHeader(h) {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Try to auto-map spreadsheet columns to fields. */
export function autoMapColumns(headers) {
  const mapping = {}
  const norm = headers.map(normHeader)
  for (const f of FIELDS) {
    let idx = -1
    for (const alias of HEADER_ALIASES[f.key]) {
      idx = norm.indexOf(alias)
      if (idx !== -1) break
    }
    if (idx === -1) {
      // loose "contains" match as a fallback
      for (let i = 0; i < norm.length && idx === -1; i++) {
        if (HEADER_ALIASES[f.key].some((a) => norm[i].includes(a))) idx = i
      }
    }
    mapping[f.key] = idx
  }
  return mapping
}

/* ------------------------------------------------------------------ */
/* Reading files                                                        */
/* ------------------------------------------------------------------ */

/** Read an .xlsx / .xls / .csv File into SheetJS rows (array of arrays). */
export async function readSpreadsheet(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false, dateNF: 'yyyy-mm-dd' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('The file has no sheets.')
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false })
  if (!rows.length) throw new Error('The file appears to be empty.')
  return { rows, sheetName, sheetNames: wb.SheetNames }
}

/**
 * Detect which row is the header row (first row within the first 5 that
 * contains at least two recognised aliases). Falls back to row 0.
 */
export function detectHeaderRow(rows) {
  const limit = Math.min(rows.length, 5)
  for (let i = 0; i < limit; i++) {
    const mapped = autoMapColumns(rows[i] || [])
    const found = Object.values(mapped).filter((v) => v !== -1).length
    if (found >= 2) return i
  }
  return 0
}

/* ------------------------------------------------------------------ */
/* Row parsing & validation                                             */
/* ------------------------------------------------------------------ */

function normalizeVehicleNumber(v) {
  return String(v ?? '')
    .toUpperCase()
    .replace(/[\s\-\.]/g, '')
}

export function vehicleKey(v) {
  return normalizeVehicleNumber(v)
}

/** Canonical (stored) vehicle number: uppercase, single spaces kept out. */
export function canonicalVehicleNumber(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

/**
 * Convert one raw spreadsheet row into a validated record.
 * `existingKeys` maps vehicleKey -> existing customer (for duplicate detection).
 */
export function parseRow(row, mapping, rowNum, existingKeys = new Map()) {
  const raw = {}
  for (const f of FIELDS) {
    const idx = mapping[f.key]
    raw[f.key] = idx >= 0 && idx < row.length ? row[idx] : ''
  }

  const errors = []
  const warnings = []

  const name = String(raw.name ?? '').trim()
  if (!name) errors.push('Customer name is missing')

  const mobileRaw = String(raw.mobile ?? '').trim()
  const mobile = normalizeMobile(mobileRaw)
  if (!mobile) errors.push(mobileRaw ? `Mobile "${mobileRaw}" is not a valid Indian mobile number` : 'Mobile number is missing')

  const vehicleNumber = canonicalVehicleNumber(raw.vehicleNumber)
  if (!vehicleNumber) errors.push('Vehicle number is missing')

  let vehicleType = String(raw.vehicleType ?? '').trim()
  if (vehicleType) {
    const match = VEHICLE_TYPES.find((t) => t.toLowerCase() === vehicleType.toLowerCase())
    vehicleType = match || 'Other'
    if (!match) warnings.push(`Unknown vehicle type "${raw.vehicleType}" saved as "Other"`)
  } else {
    vehicleType = 'Other'
  }

  const dateResult = parseDateValue(raw.pucExpiryDate)
  if (!dateResult.ok) {
    errors.push(`Expiry date: ${dateResult.reason}`)
  } else if (dateResult.ambiguous) {
    warnings.push(`Date "${String(raw.pucExpiryDate).trim()}" read as ${formatDate(dateResult.iso)} (day/month). Please verify.`)
  }

  const email = String(raw.email ?? '').trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    warnings.push(`Email "${email}" looks invalid and will be left blank`)
  }
  const address = String(raw.address ?? '').trim()

  let duplicate = null
  if (vehicleNumber) {
    const existing = existingKeys.get(normalizeVehicleNumber(vehicleNumber))
    if (existing) duplicate = { id: existing.id, name: existing.name, pucExpiryDate: existing.pucExpiryDate }
  }

  return {
    rowNum,
    raw,
    name,
    mobile,
    mobileRaw,
    vehicleNumber,
    vehicleType,
    pucExpiryDate: dateResult.iso,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    address,
    errors,
    warnings,
    ambiguousDate: dateResult.ambiguous,
    duplicate,
    valid: errors.length === 0,
  }
}

/** Parse all rows after the header row. */
export function parseRows(rows, headerRowIndex, mapping, existingCustomers = []) {
  const existingKeys = new Map(existingCustomers.map((c) => [normalizeVehicleNumber(c.vehicleNumber), c]))
  const records = []
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((cell) => String(cell ?? '').trim() === '')) continue
    records.push(parseRow(row, mapping, i + 1, existingKeys))
  }
  return records
}

/* ------------------------------------------------------------------ */
/* Exports                                                              */
/* ------------------------------------------------------------------ */

function downloadWorkbook(wb, fileName) {
  XLSX.writeFile(wb, fileName)
}

const CUSTOMER_HEADERS = [
  'Customer Name',
  'Mobile Number',
  'Vehicle Number',
  'Vehicle Type',
  'PUC Expiry Date',
  'Days Remaining',
  'Expiry Status',
  '30-Day Reminder Date',
  '30-Day Reminder Status',
  '15-Day Reminder Date',
  '15-Day Reminder Status',
  '7-Day Reminder Date',
  '7-Day Reminder Status',
  'Email',
  'Address',
  'Date Added',
]

function customerRow(customer, reminders, today) {
  const recs = new Map(
    reminders.filter((r) => r.customerId === customer.id && r.cycleExpiry === customer.pucExpiryDate).map((r) => [r.interval, r])
  )
  const intervals = [30, 15, 7]
  const cmp = Math.round(
    (Date.parse(customer.pucExpiryDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000
  )
  const expiryStatus = cmp < 0 ? 'Expired' : cmp === 0 ? 'Expires Today' : cmp <= 30 ? 'Expiring Soon' : 'Upcoming'
  const row = [
    customer.name,
    customer.mobile || '',
    customer.vehicleNumber,
    customer.vehicleType,
    formatDate(customer.pucExpiryDate),
    cmp,
    expiryStatus,
  ]
  for (const iv of intervals) {
    const rec = recs.get(iv)
    row.push(rec ? formatDate(rec.scheduledDate) : '')
    row.push(rec ? statusLabel(effectiveStatus(rec, today)) : 'Not scheduled')
  }
  row.push(customer.email || '', customer.address || '', formatDate(customer.createdAt?.slice(0, 10) || ''))
  return row
}

/** Export customers (all or filtered) with reminder columns. */
export function exportCustomers(customers, reminders, today, fileName = 'puc-customers.xlsx') {
  const wsData = [CUSTOMER_HEADERS, ...customers.map((c) => customerRow(c, reminders, today))]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = CUSTOMER_HEADERS.map((h) => ({ wch: Math.max(14, h.length + 4) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Customers')
  downloadWorkbook(wb, fileName)
}

/** Export reminder records (history) to Excel. */
export function exportReminders(records, today, fileName = 'puc-reminders.xlsx') {
  const headers = [
    'Customer Name',
    'Mobile Number',
    'Vehicle Number',
    'PUC Expiry (Cycle)',
    'Reminder Interval',
    'Scheduled Reminder Date',
    'Reminder Status',
    'WhatsApp Opened At',
    'Confirmed Sent At',
    'Message Used',
    'Notes',
  ]
  const wsData = [
    headers,
    ...records.map((r) => [
      r.customer?.name || '',
      r.customer?.mobile || '',
      r.vehicleNumber || r.customer?.vehicleNumber || '',
      formatDate(r.cycleExpiry),
      `${r.interval} days before expiry`,
      formatDate(r.scheduledDate),
      statusLabel(r.state || effectiveStatus(r, today)),
      r.openedAt ? new Date(r.openedAt).toLocaleString('en-GB') : '',
      r.confirmedAt ? new Date(r.confirmedAt).toLocaleString('en-GB') : '',
      r.message || '',
      r.notes || '',
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(14, h.length + 3) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Reminders')
  downloadWorkbook(wb, fileName)
}

/** The template's rows (pure data — used by downloadTemplate and tests). */
export function templateRows() {
  return [
    ['Customer Name', 'Mobile Number', 'Vehicle Number', 'Vehicle Type', 'PUC Expiry Date'],
    ['Rahul Patel', '9876543210', 'GJ01AB1234', 'Car', '30/12/2026'],
    ['Amit Shah', '9123456780', 'GJ01CD5678', 'Bike', '15/12/2026'],
  ]
}

/** Download the import template with sample rows. */
export function downloadTemplate() {
  const headers = ['Customer Name', 'Mobile Number', 'Vehicle Number', 'Vehicle Type', 'PUC Expiry Date']
  const sample = templateRows().slice(1)
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample])
  ws['!cols'] = headers.map((h) => ({ wch: 20 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Customers')
  downloadWorkbook(wb, 'puc-import-template.xlsx')
}

/** Generic CSV download helper (used for reports). */
export function downloadCSV(rows, fileName) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell === null || cell === undefined ? '' : String(cell)
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(',')
    )
    .join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, fileName)
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
