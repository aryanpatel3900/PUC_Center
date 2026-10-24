import { describe, it, expect } from 'vitest'
import { normalizeMobile, isValidIndianMobile, mobileError, formatMobile } from '../phoneUtils'

describe('phoneUtils', () => {
  it('accepts plain 10-digit numbers starting 6-9', () => {
    expect(normalizeMobile('9876543210')).toBe('9876543210')
    expect(isValidIndianMobile('6123456789')).toBe(true)
    expect(isValidIndianMobile('9123456780')).toBe(true) // starts with 91 but is a valid 10-digit number
  })

  it('strips +91, 91 and 0 prefixes', () => {
    expect(normalizeMobile('+91 98765 43210')).toBe('9876543210')
    expect(normalizeMobile('919876543210')).toBe('9876543210')
    expect(normalizeMobile('09876543210')).toBe('9876543210')
    expect(normalizeMobile('98765-43210')).toBe('9876543210')
  })

  it('rejects invalid numbers', () => {
    expect(isValidIndianMobile('1234567890')).toBe(false) // starts with 1
    expect(isValidIndianMobile('987654321')).toBe(false) // 9 digits
    expect(isValidIndianMobile('98765432101')).toBe(false) // 11 digits (no leading 0/91 pattern)
    expect(isValidIndianMobile('')).toBe(false)
    expect(isValidIndianMobile(null)).toBe(false)
    expect(isValidIndianMobile('abcdefghij')).toBe(false)
  })

  it('TEST 9: invalid numbers are reported with a helpful message', () => {
    expect(mobileError('12345')).not.toBe('')
    expect(mobileError('9876543210')).toBe('')
    expect(mobileError('')).not.toBe('')
  })

  it('formats for display', () => {
    expect(formatMobile('9876543210')).toBe('+91 98765 43210')
    expect(formatMobile('bad')).toBe('—')
  })
})
