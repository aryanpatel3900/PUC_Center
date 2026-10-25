// Excel / CSV import and export built on SheetJS (xlsx).
// All parsing happens in the browser — files never leave the computer.
//
// The importer is deliberately "smart":
//   1. It scans the first rows to FIND the header row (headers are not always row 1).
//   2. It matches columns by header meaning (many aliases, punctuation/case tolerant).
//   3. If headers are unclear it falls back to value patterns (plates, mobiles, dates).
//   4. It inspects every worksheet and prefers the sheet that looks like customer data.
//   5. Blank / formatting-only rows are ignored, never counted as invalid customers.

import * as XLSX from 'xlsx'
import { parseDateValue, formatDate } from './dateUtils'
import { normalizeMobile } from './phoneUtils'
import { effectiveStatus, statusLabel } from './reminderUtils'

/* ------------------------------------------------------------------ */
/* Fields                                                               */
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

/** Keys that must be present for a row to become an importable record. */
export const REQUIRED_KEYS = ['name', 'mobile', 'vehicleNumber', 'pucExpiryDate']

/**
 * Recognised header names per field (normalised: lowercase, punctuation → space).
 * Matching is done in two passes: exact match first, then whole-word "contains".
 */
export const HEADER_ALIASES = {
  name: [
    'customer name', 'name', 'customer', 'client name', 'owner name', 'owner', 'full name',
    'cust name', 'cust', 'name of customer', 'customer full name', 'party name',
    'નામ', 'ગ્રાહકનું નામ', 'ગ્રાહક નામ',
  ],
  mobile: [
    'mobile', 'mobile no', 'mobile number', 'mob', 'mob no', 'mob number',
    'phone', 'phone no', 'phone number', 'contact', 'contact no', 'contact number',
    'whatsapp', 'whatsapp no', 'whatsapp number', 'whats app', 'wa no',
    'tel', 'tel no', 'telephone', 'telephone number',
    'મોબાઇલ', 'મોબાઇલ નંબર', 'ફોન', 'ફોન નંબર',
  ],
  vehicleNumber: [
    'vehicle', 'vehicle no', 'vehicle number', 'veh', 'veh no', 'veh number',
    'vehicle registration', 'vehicle registration number', 'registration number',
    'registration no', 'registration', 'reg no', 'reg', 'regd no',
    'rc number', 'rc no', 'rc', 'vehicle rc no', 'rc book no',
    'car number', 'bike number',
    'વાહન નંબર', 'ગાડી નંબર',
  ],
  vehicleType: [
    'vehicle type', 'type', 'veh type', 'vehicle category', 'category', 'class',
    'vehicle class', 'વાહન પ્રકાર',
  ],
  pucExpiryDate: [
    'puc expiry date', 'puc expiry', 'puc expiry dt', 'puc expire date', 'puc exp date',
    'puc exp', 'expiry date', 'expiry dt', 'expiry', 'expire date', 'expiration date',
    'exp date', 'exp dt', 'valid till', 'validity', 'validity date', 'puc valid till',
    'puc validity', 'puc upto', 'valid upto', 'valid until', 'puc date', 'date of expiry',
    'તારીખ', 'માન્ય તારીખ', 'મુદત',
  ],
  email: ['email', 'e mail', 'email address', 'mail'],
  address: ['address', 'addr', 'location', 'સરનામું', 'સરનામુ'],
}

/**
 * Words that DISQUALIFY a header for a field during the loose "contains" pass,
 * so extra columns (Insurance Expiry, Agent Name, Engine No…) are ignored
 * instead of being mistaken for the real field.
 */
const NEGATIVE_HINTS = {
  name: ['agent', 'employee', 'staff', 'dealer', 'sales', 'user', 'author', 'created', 'updated', 'driver', 'Father', 'husband', 'vehicle'],
  mobile: ['landline', 'std', 'fax', 'extension', 'imei', 'sim'],
  vehicleNumber: ['insurance', 'engine', 'chassis', 'date', 'dt', 'year', 'purchase', 'buy', 'sale', 'invoice', 'tax', 'fitness', 'permit', 'price', 'amount', 'model', 'make'],
  vehicleType: ['fuel', 'color', 'colour', 'make', 'model', 'engine'],
  pucExpiryDate: ['insurance', 'tax', 'fitness', 'permit', 'service', 'warranty', 'purchase', 'buy', 'sale', 'invoice', 'registration date', 'rc date', 'manufacture', 'mfg', 'manufacturing', 'policy'],
  email: [],
  address: [],
}

export const VEHICLE_TYPES = ['Bike', 'Car', 'Auto', 'Bus', 'Truck', 'Jeep', 'Taxi', 'Tempo', 'Other']

/* ------------------------------------------------------------------ */
/* Header normalisation & matching                                      */
/* ------------------------------------------------------------------ */

/** Lowercase, turn any punctuation (._-#()/ etc.) into single spaces, trim. */
export function normalizeHeader(h) {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasWord(haystack, word) {
  return (` ${haystack} `).includes(` ${word} `)
}

function hasNegativeHint(field, headerNorm) {
  return (NEGATIVE_HINTS[field] || []).some((w) => hasWord(headerNorm, normalizeHeader(w)))
}

// Pre-compute normalised alias sets (exact pass) and length-sorted lists
// (loose pass: longest alias first so "puc expiry date" wins over "expiry").
const ALIAS_SETS = {}
const ALIAS_SORTED = {}
for (const f of FIELDS) {
  ALIAS_SETS[f.key] = new Set(HEADER_ALIASES[f.key].map(normalizeHeader))
  ALIAS_SORTED[f.key] = [...new Set(HEADER_ALIASES[f.key].map(normalizeHeader))].sort((a, b) => b.length - a.length)
}

/**
 * Map header cells to field keys. Every column is claimed at most once.
 * Pass 1 = exact alias match. Pass 2 = whole-word contains match (longest
 * aliases first, negative hints skipped). Extra columns stay unmapped.
 */
export function autoMapColumns(headers) {
  const mapping = {}
  for (const f of FIELDS) mapping[f.key] = -1
  const norm = (headers || []).map(normalizeHeader)
  const claimed = new Set()

  // Pass 1 — exact
  for (const f of FIELDS) {
    for (let i = 0; i < norm.length; i++) {
      if (claimed.has(i)) continue
      if (ALIAS_SETS[f.key].has(norm[i])) {
        mapping[f.key] = i
        claimed.add(i)
        break
      }
    }
  }

  // Pass 2 — whole-word contains (longest alias first), no negative hints
  for (const f of FIELDS) {
    if (mapping[f.key] !== -1) continue
    for (const alias of ALIAS_SORTED[f.key]) {
      for (let i = 0; i < norm.length; i++) {
        if (claimed.has(i)) continue
        if (norm[i] === alias) continue // exact pass already handled
        if (hasNegativeHint(f.key, norm[i])) continue
        if (hasWord(norm[i], alias)) {
          mapping[f.key] = i
          claimed.add(i)
          break
        }
      }
      if (mapping[f.key] !== -1) break
    }
  }
  return mapping
}

/**
 * Find the header row among the first `scanLimit` rows by scoring how many of
 * the four required fields each row recognises. Returns -1 when no row looks
 * like a header (caller then falls back to value-based detection).
 */
export function detectHeaderRow(rows, scanLimit = 20) {
  const list = rows || []
  let best = -1
  let bestScore = 0
  const limit = Math.min(list.length, scanLimit)
  for (let i = 0; i < limit; i++) {
    const row = list[i] || []
    const nonEmpty = row.filter((c) => String(c ?? '').trim() !== '')
    if (nonEmpty.length < 2) continue // titles, blanks, generated-date rows
    const m = autoMapColumns(row)
    const score = REQUIRED_KEYS.reduce((n, k) => n + (m[k] >= 0 ? 1 : 0), 0)
    if (score > bestScore) {
      bestScore = score
      best = i
    }
    if (bestScore >= REQUIRED_KEYS.length) break
  }
  return bestScore >= 2 ? best : -1
}

/* ------------------------------------------------------------------ */
/* Value-pattern detection (secondary signal)                           */
/* ------------------------------------------------------------------ */

/** Loose Indian plate check: GJ01AB1234, GJ 01 AB 1234, MH12Q1234, DL3CAB1234… */
export function isPlateLike(v) {
  const s = String(v ?? '').trim().toUpperCase()
  if (!s || s.length < 6 || s.length > 14) return false
  if (normalizeMobile(s)) return false // mobile numbers are not plates
  const compact = s.replace(/[\s\-.]/g, '')
  return /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,6}$/.test(compact)
}

/** Date-shaped value: separated date text, or a plausible Excel serial. */
export function isDateLikeValue(v) {
  if (v instanceof Date) return true
  const s = String(v ?? '').trim()
  if (!s) return false
  if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(s)) return parseDateValue(s).ok
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s)) return parseDateValue(s).ok
  if (/^\d{4,6}$/.test(s)) {
    const n = Number(s)
    return n >= 20000 && n <= 80000 // serial range ≈ 1954–2118
  }
  return false
}

/** Name-shaped value: letters only (English/Gujarati/Hindi), no digits/plates. */
export function isNameLikeValue(v) {
  const s = String(v ?? '').trim()
  if (s.length < 2 || s.length > 60) return false
  if (!/\p{L}/u.test(s)) return false
  if (normalizeMobile(s)) return false
  if (isPlateLike(s)) return false
  if (isDateLikeValue(s)) return false
  return /^[\p{L}\s.'\-()]+$/u.test(s)
}

/**
 * Detect columns from the DATA itself (used when headers are unclear).
 * Header matching runs first; this only fills fields still unmapped.
 * Returns { fieldKey: columnIndex } for confident columns only.
 */
export function detectColumnsByValues(rows, sampleSize = 150) {
  const result = {}
  const sample = []
  for (const r of rows || []) {
    if (r && r.some((c) => String(c ?? '').trim() !== '')) {
      sample.push(r)
      if (sample.length >= sampleSize) break
    }
  }
  if (sample.length < 2) return result

  const colCount = sample.reduce((n, r) => Math.max(n, (r || []).length), 0)
  const claimed = new Set()
  const specs = [
    { field: 'mobile', fn: (v) => normalizeMobile(v) !== null, threshold: 0.7 },
    { field: 'vehicleNumber', fn: isPlateLike, threshold: 0.7 },
    { field: 'pucExpiryDate', fn: isDateLikeValue, threshold: 0.7, strictNumeric: true },
    { field: 'name', fn: isNameLikeValue, threshold: 0.75 },
  ]

  for (const spec of specs) {
    let bestCol = -1
    let bestRatio = 0
    for (let c = 0; c < colCount; c++) {
      if (claimed.has(c)) continue
      const values = []
      for (const r of sample) {
        const v = r[c]
        if (v !== undefined && v !== null && String(v).trim() !== '') values.push(v)
      }
      if (values.length < 2) continue
      const hits = values.filter(spec.fn).length
      let ratio = hits / values.length
      if (spec.strictNumeric) {
        // A pure-number column must be almost perfectly serial-shaped before we
        // trust it as dates (guards against Amount columns in the 20000–80000 range).
        const sepHits = values.filter((v) => typeof v === 'string' && /[\/\-.]/.test(v) && spec.fn(v)).length
        if (sepHits === 0) ratio = hits / values.length >= 0.95 ? ratio : 0
      }
      if (ratio >= spec.threshold && ratio > bestRatio) {
        bestRatio = ratio
        bestCol = c
      }
    }
    if (bestCol >= 0) {
      result[spec.field] = bestCol
      claimed.add(bestCol)
    }
  }
  return result
}

/** A row counts as a customer row when at least one REQUIRED mapped column has a value. */
export function isDataRow(row, mapping) {
  if (!row) return false
  const requiredIdx = REQUIRED_KEYS.map((k) => mapping[k]).filter((i) => i >= 0)
  if (requiredIdx.length) {
    return requiredIdx.some((i) => i < row.length && String(row[i] ?? '').trim() !== '')
  }
  const mappedIdx = FIELDS.map((f) => mapping[f.key]).filter((i) => i >= 0)
  if (mappedIdx.length) return mappedIdx.some((i) => i < row.length && String(row[i] ?? '').trim() !== '')
  return row.some((c) => String(c ?? '').trim() !== '')
}

/** First row looks like column labels: several text cells, none data-shaped. */
function looksLikeLabelRow(row) {
  const cells = (row || []).map((c) => String(c ?? '').trim()).filter(Boolean)
  if (cells.length < 2) return false
  return cells.every((c) => !normalizeMobile(c) && !isPlateLike(c) && !isDateLikeValue(c))
}

function buildHeaders(row, colCount) {
  const len = Math.max(colCount, (row || []).length)
  return Array.from({ length: len }, (_, i) => String((row || [])[i] ?? '').trim() || `Column ${i + 1}`)
}

/* ------------------------------------------------------------------ */
/* Workbook analysis (multi-sheet aware)                                */
/* ------------------------------------------------------------------ */

/** Read an .xlsx / .xls / .csv File into a SheetJS workbook (browser only). */
export async function readWorkbook(file) {
  const buf = await file.arrayBuffer()
  if (!buf || buf.byteLength === 0) throw new Error('This file appears to be empty.')
  let wb
  try {
    // raw:true keeps CSV values as text so leading zeros in mobiles survive.
    wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: true })
  } catch {
    throw new Error('This file could not be read. It may be damaged, password protected, or not a valid Excel/CSV file.')
  }
  if (!wb || !wb.SheetNames || !wb.SheetNames.length) {
    throw new Error('This file appears to be empty.')
  }
  return wb
}

/**
 * Analyse one sheet: find the header row, map columns (headers first, value
 * patterns second) and count real data rows.
 */
export function analyzeSheet(rows) {
  const list = rows || []
  const colCount = list.slice(0, 300).reduce((n, r) => Math.max(n, (r || []).length), 0)

  let headerRow = detectHeaderRow(list)
  let method = 'none'
  let headers = []
  let mapping = {}
  for (const f of FIELDS) mapping[f.key] = -1

  if (headerRow >= 0) {
    headers = buildHeaders(list[headerRow], colCount)
    mapping = autoMapColumns(headers)
    method = 'header'
  } else if (list.length && looksLikeLabelRow(list[0])) {
    // Unrecognised header wording, but row 0 is clearly labels — skip it so it
    // never becomes a fake invalid customer.
    headerRow = 0
    headers = buildHeaders(list[0], colCount)
    mapping = autoMapColumns(headers)
    method = 'header'
  } else {
    headers = Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`)
  }

  const hadHeader = method === 'header'
  const dataRows = list.slice(headerRow + 1)
  const detected = detectColumnsByValues(dataRows)
  let valueFills = 0
  for (const key of REQUIRED_KEYS) {
    if (mapping[key] === -1 && detected[key] !== undefined) {
      mapping[key] = detected[key]
      valueFills += 1
    }
  }
  if (valueFills > 0) method = hadHeader ? 'mixed' : 'values'

  const requiredFound = REQUIRED_KEYS.filter((k) => mapping[k] >= 0).length
  const dataRowCount = dataRows.reduce((n, r) => n + (isDataRow(r, mapping) ? 1 : 0), 0)
  return { headerRow, headers, mapping, method, requiredFound, dataRowCount }
}

/**
 * Analyse every worksheet and pick the most likely customer sheet.
 * Returns { sheets: [{name, rows, rowOffset, ...analysis}], bestIndex, candidateCount }.
 */
export function analyzeWorkbook(wb) {
  const sheets = (wb.SheetNames || []).map((name) => {
    let rows = []
    let rowOffset = 0
    try {
      const ws = wb.Sheets[name]
      if (ws) {
        // blankrows:true keeps indices aligned with real Excel row numbers.
        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: true })
        if (ws['!ref']) rowOffset = XLSX.utils.decode_range(ws['!ref']).s.r
      }
    } catch {
      rows = []
    }
    return { name, rows, rowOffset, ...analyzeSheet(rows) }
  })

  const candidates = sheets
    .map((s, i) => ({ i, s }))
    .filter((x) => x.s.requiredFound >= 2 && x.s.dataRowCount > 0)
    .sort((a, b) => b.s.requiredFound - a.s.requiredFound || b.s.dataRowCount - a.s.dataRowCount)

  return { sheets, bestIndex: candidates.length ? candidates[0].i : 0, candidateCount: candidates.length }
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

/** Canonical (stored) vehicle number: uppercase, single spaces, tidy separators. */
export function canonicalVehicleNumber(v) {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*\.\s*/g, '.')
    .trim()
}

function nameKey(name, mobile) {
  return `${String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')}|${mobile ?? ''}`
}

/**
 * Convert one raw spreadsheet row into a validated record.
 * - `existingKeys`: vehicleKey -> existing customer (strong duplicate).
 * - `existingNameMobile`: "name|mobile" -> existing customer (possible duplicate,
 *   e.g. the same person who owns a second vehicle — shown but never blocked).
 */
export function parseRow(row, mapping, rowNum, existingKeys = new Map(), existingNameMobile = new Map()) {
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

  const dateRaw = String(raw.pucExpiryDate ?? '').trim()
  const dateResult = parseDateValue(raw.pucExpiryDate)
  if (!dateRaw) {
    errors.push('Expiry date is missing')
  } else if (!dateResult.ok) {
    errors.push(`Expiry date "${dateRaw}" could not be read`)
  } else if (dateResult.ambiguous) {
    warnings.push(`Date "${dateRaw}" read as ${formatDate(dateResult.iso)} (day/month). Please verify.`)
  }

  const email = String(raw.email ?? '').trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    warnings.push(`Email "${email}" looks invalid and will be left blank`)
  }
  const address = String(raw.address ?? '').trim()

  // Strong duplicate: same vehicle number already exists.
  let duplicate = null
  let possibleDuplicate = ''
  if (vehicleNumber) {
    const existing = existingKeys.get(normalizeVehicleNumber(vehicleNumber))
    if (existing) {
      duplicate = {
        id: existing.id,
        name: existing.name,
        pucExpiryDate: existing.pucExpiryDate,
        reason: `Vehicle ${existing.vehicleNumber || vehicleNumber} already exists`,
      }
    } else if (mobile && name) {
      const samePerson = existingNameMobile.get(nameKey(name, mobile))
      if (samePerson) {
        possibleDuplicate = `Same name & mobile as ${samePerson.name} (${samePerson.vehicleNumber}) — different vehicle, will be imported`
      }
    }
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
    possibleDuplicate,
    valid: errors.length === 0,
  }
}

/**
 * Parse all data rows after the header row (headerRowIndex may be -1 for a
 * headerless file). Blank / formatting-only rows are ignored entirely, so a
 * sheet with 5000 rows and 300 customers yields ~300 records — not 4700 errors.
 * `rowOffset` keeps reported row numbers matching the real Excel rows.
 */
export function parseRows(rows, headerRowIndex, mapping, existingCustomers = [], rowOffset = 0) {
  const existingKeys = new Map()
  const existingNameMobile = new Map()
  for (const c of existingCustomers || []) {
    existingKeys.set(normalizeVehicleNumber(c.vehicleNumber), c)
    const m = normalizeMobile(c.mobile)
    if (m) existingNameMobile.set(nameKey(c.name, m), c)
  }

  const seenVehicles = new Set()
  const seenNameMobile = new Set()
  const records = []
  const start = Math.max(headerRowIndex + 1, 0)
  const list = rows || []

  for (let i = start; i < list.length; i++) {
    const row = list[i]
    if (!isDataRow(row, mapping)) continue // blank / irrelevant row — not a customer
    const rec = parseRow(row, mapping, i + 1 + rowOffset, existingKeys, existingNameMobile)

    // In-file duplicates (only valid rows can consume a "first occurrence").
    if (rec.valid && rec.vehicleNumber) {
      const vk = normalizeVehicleNumber(rec.vehicleNumber)
      if (seenVehicles.has(vk)) {
        rec.duplicate = { id: null, name: rec.name, pucExpiryDate: rec.pucExpiryDate, reason: 'Same vehicle as an earlier row in this file' }
      } else {
        seenVehicles.add(vk)
      }
    }
    if (rec.valid && rec.mobile && rec.name && !rec.duplicate) {
      const nk = nameKey(rec.name, rec.mobile)
      if (seenNameMobile.has(nk)) rec.possibleDuplicate = 'Same name & mobile as an earlier row in this file'
      else seenNameMobile.add(nk)
    }

    records.push(rec)
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
