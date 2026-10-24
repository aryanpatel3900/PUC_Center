// Date-only utilities. All dates are handled as plain 'YYYY-MM-DD' strings so no
// timezone / daylight-saving shifts can occur. Arithmetic is done on UTC midnights.

const MS_DAY = 86400000

const pad = (n) => String(n).padStart(2, '0')

/** Today's local calendar date as 'YYYY-MM-DD'. */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Validate a 'YYYY-MM-DD' string and confirm it is a real calendar date. */
export function isValidISO(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2999) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** Convert an ISO string to a UTC-midnight timestamp (for safe math). */
function isoToUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function utcToISO(ms) {
  const dt = new Date(ms)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** Add (or subtract) whole calendar days from an ISO date. DST-safe. */
export function addDaysISO(iso, days) {
  return utcToISO(isoToUTC(iso) + days * MS_DAY)
}

/** Whole days from a to b (b - a). Both 'YYYY-MM-DD'. */
export function diffDays(a, b) {
  return Math.round((isoToUTC(b) - isoToUTC(a)) / MS_DAY)
}

/** -1 if a < b, 0 if equal, 1 if a > b. */
export function compareISO(a, b) {
  const ua = isoToUTC(a)
  const ub = isoToUTC(b)
  return ua < ub ? -1 : ua > ub ? 1 : 0
}

/** Format an ISO date as 'DD/MM/YYYY' (or the user's chosen format). */
export function formatDate(iso, format = 'DD/MM/YYYY') {
  if (!isValidISO(iso)) return iso ? String(iso) : '—'
  const [y, m, d] = iso.split('-')
  if (format === 'YYYY-MM-DD') return `${y}-${m}-${d}`
  return `${d}/${m}/${y}`
}

/** Human friendly "30 Dec 2026" style label. */
export function formatDateLong(iso) {
  if (!isValidISO(iso)) return '—'
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [y, m, d] = iso.split('-').map(Number)
  return `${pad(d)} ${months[m - 1]} ${y}`
}

/** 'YYYY-MM' month key for grouping. */
export function monthKey(iso) {
  return iso.slice(0, 7)
}

/** Add months to an ISO date, clamping the day (e.g. 31 Jan + 1 month = 28 Feb). */
export function addMonthsISO(iso, months) {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(d, lastDay))}`
}

/** Current timestamp as an ISO string (for history entries). */
export function nowTimestamp() {
  return new Date().toISOString()
}

/** Local 'DD/MM/YYYY HH:MM' display for timestamps. */
export function formatTimestamp(isoTs) {
  if (!isoTs) return '—'
  const dt = new Date(isoTs)
  if (Number.isNaN(dt.getTime())) return '—'
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

/**
 * Parse a date that may come from an Excel cell, a text input, or a Date object.
 * Accepts: 'YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY', 'D/M/YYYY', Excel serial
 * numbers, and Date instances.
 *
 * Indian convention is DD/MM/YYYY. When both parts could be a month (e.g.
 * 05/04/2026) the day-first interpretation is used and `ambiguous` is flagged
 * so the UI can show it to the user instead of guessing silently.
 *
 * Returns { iso, ok, ambiguous, reason }.
 */
export function parseDateValue(value) {
  if (value === null || value === undefined || value === '') {
    return { iso: '', ok: false, ambiguous: false, reason: 'Date is empty' }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { iso: todayISO(value), ok: true, ambiguous: false, reason: '' }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return parseExcelSerial(value)
  }

  const s = String(value).trim()

  // ISO format
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    const iso = `${y}-${pad(m)}-${pad(d)}`
    if (!isValidISO(iso)) return { iso: '', ok: false, ambiguous: false, reason: `"${s}" is not a valid date` }
    return { iso, ok: true, ambiguous: false, reason: '' }
  }

  // Excel serial stored as text
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    if (n >= 1 && n < 200000) return parseExcelSerial(n)
  }

  // DD/MM/YYYY or DD-MM-YYYY (also D/M/YY)
  const m1 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (m1) {
    let [, a, b, cy] = m1.map(Number)
    const year = cy < 100 ? 2000 + cy : cy
    const day = a
    const month = b
    const ambiguous = day <= 12 && month <= 12 && day !== month
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { iso: '', ok: false, ambiguous: false, reason: `"${s}" is not a valid date (expected DD/MM/YYYY)` }
    }
    const iso = `${year}-${pad(month)}-${pad(day)}`
    if (!isValidISO(iso)) return { iso: '', ok: false, ambiguous: false, reason: `"${s}" is not a valid calendar date` }
    return { iso, ok: true, ambiguous, reason: '' }
  }

  return { iso: '', ok: false, ambiguous: false, reason: `"${s}" is not a recognised date (use DD/MM/YYYY)` }
}

function parseExcelSerial(serial) {
  if (!Number.isFinite(serial) || serial < 1 || serial >= 200000) {
    return { iso: '', ok: false, ambiguous: false, reason: `Excel serial "${serial}" is out of range` }
  }
  // Excel's day 1 = 1899-12-31, but the common epoch offset used by SheetJS
  // (accounting for the fictitious 1900-02-29) is 1899-12-30.
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * MS_DAY
  const iso = utcToISO(ms)
  return { iso, ok: isValidISO(iso), ambiguous: false, reason: '' }
}

/** Build a UTC timestamp from an ISO date at a given hour (for charts). */
export function isoToChartDate(iso) {
  return new Date(isoToUTC(iso))
}
