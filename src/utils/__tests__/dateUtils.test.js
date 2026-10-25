import { describe, it, expect } from 'vitest'
import {
  todayISO,
  addDaysISO,
  diffDays,
  compareISO,
  formatDate,
  parseDateValue,
  isValidISO,
  addMonthsISO,
} from '../dateUtils'

describe('dateUtils', () => {
  it('formats dates as DD/MM/YYYY', () => {
    expect(formatDate('2026-12-30')).toBe('30/12/2026')
    expect(formatDate('2026-01-05')).toBe('05/01/2026')
  })

  it('adds days across month and year boundaries', () => {
    expect(addDaysISO('2026-12-30', -30)).toBe('2026-11-30')
    expect(addDaysISO('2026-12-30', -15)).toBe('2026-12-15')
    expect(addDaysISO('2026-12-30', -7)).toBe('2026-12-23')
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29') // leap year
  })

  it('is not affected by the machine timezone (pure calendar math)', () => {
    // Guard: arithmetic on date strings must equal UTC-midnight arithmetic.
    const base = '2026-03-29'
    for (let d = -60; d <= 60; d++) {
      const iso = addDaysISO(base, d)
      expect(diffDays(base, iso)).toBe(d)
      expect(isValidISO(iso)).toBe(true)
    }
  })

  it('compares dates correctly', () => {
    expect(compareISO('2026-01-01', '2026-01-02')).toBe(-1)
    expect(compareISO('2026-01-02', '2026-01-02')).toBe(0)
    expect(compareISO('2026-01-03', '2026-01-02')).toBe(1)
  })

  it('returns today as a local YYYY-MM-DD string', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(todayISO()).toBe(expected)
  })

  it('parses DD/MM/YYYY text dates (Indian format)', () => {
    expect(parseDateValue('30/12/2026')).toMatchObject({ iso: '2026-12-30', ok: true })
    expect(parseDateValue('5/1/2026')).toMatchObject({ iso: '2026-01-05', ok: true })
    expect(parseDateValue('31-04-2026').ok).toBe(false) // April has 30 days
    expect(parseDateValue('not a date').ok).toBe(false)
  })

  it('flags ambiguous DD/MM dates instead of guessing silently', () => {
    expect(parseDateValue('05/04/2026').ambiguous).toBe(true) // 5 Apr (day first)
    expect(parseDateValue('05/04/2026').iso).toBe('2026-04-05')
    expect(parseDateValue('25/12/2026').ambiguous).toBe(false) // unambiguous
  })

  it('parses Excel date serial numbers', () => {
    // 46023 is the Excel serial for 2026-01-01 (epoch 1899-12-30).
    expect(parseDateValue(46023)).toMatchObject({ iso: '2026-01-01', ok: true })
    expect(parseDateValue('46023').iso).toBe('2026-01-01') // serial stored as text
    expect(parseDateValue(0).ok).toBe(false)
    expect(parseDateValue(-5).ok).toBe(false)
    expect(parseDateValue(5000).ok).toBe(false) // implausibly old serial → not guessed
    expect(parseDateValue('2026').ok).toBe(false) // bare year must not become 1905-06-26
  })

  it('parses the extra formats found in real Excel / CSV files', () => {
    expect(parseDateValue('2026-12-05')).toMatchObject({ iso: '2026-12-05', ok: true }) // ISO
    expect(parseDateValue('2026/12/05')).toMatchObject({ iso: '2026-12-05', ok: true }) // YYYY/MM/DD
    expect(parseDateValue('2026.12.05')).toMatchObject({ iso: '2026-12-05', ok: true }) // YYYY.MM.DD
    expect(parseDateValue('05.01.2027')).toMatchObject({ iso: '2027-01-05', ok: true }) // DD.MM.YYYY
    expect(parseDateValue('30/12/2026 00:00:00')).toMatchObject({ iso: '2026-12-30', ok: true }) // datetime suffix
    expect(parseDateValue('2026-10-24 12:00:00')).toMatchObject({ iso: '2026-10-24', ok: true })
    expect(parseDateValue('24/10/2026 5:30 PM')).toMatchObject({ iso: '2026-10-24', ok: true })
    expect(parseDateValue('30/12/26').iso).toBe('2026-12-30') // 2-digit year
    expect(parseDateValue('30/12/2026').ambiguous).toBe(false) // day > 12 → clearly day-first
  })

  it('reads month-first dates when only that reading is valid', () => {
    const r = parseDateValue('12/25/2026') // 25 cannot be a month
    expect(r).toMatchObject({ iso: '2026-12-25', ok: true, ambiguous: false })
  })

  it('adds months with day clamping', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsISO('2026-12-15', 1)).toBe('2027-01-15')
  })
})
