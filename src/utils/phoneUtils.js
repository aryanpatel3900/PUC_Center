// Indian mobile number normalisation and validation.

/**
 * Normalise any user input to a bare 10-digit Indian mobile number.
 * Handles: spaces, dashes, dots, leading +91 / 91 / 0 prefixes.
 * Returns the 10-digit string, or null when the input is not a valid
 * Indian mobile number.
 */
export function normalizeMobile(input) {
  if (input === null || input === undefined) return null
  let s = String(input).trim()
  if (!s) return null

  // Keep a leading + only to strip it with the digits below.
  s = s.replace(/[^\d]/g, '')
  if (!s) return null

  if (s.length === 13 && s.startsWith('91')) s = s.slice(2)
  else if (s.length === 12 && s.startsWith('91')) s = s.slice(2)
  else if (s.length === 11 && s.startsWith('0')) s = s.slice(1)

  if (s.length !== 10) return null
  if (!/^[6-9]\d{9}$/.test(s)) return null
  return s
}

/** True when the input can be normalised to a valid Indian mobile number. */
export function isValidIndianMobile(input) {
  return normalizeMobile(input) !== null
}

/** Display form: '+91 98765 43210'. Returns '—' when invalid. */
export function formatMobile(input) {
  const n = normalizeMobile(input)
  if (!n) return '—'
  return `+91 ${n.slice(0, 5)} ${n.slice(5)}`
}

/**
 * Explain what is wrong with a mobile number so the UI can tell the user.
 * Returns '' when the number is valid.
 */
export function mobileError(input) {
  if (input === null || input === undefined || String(input).trim() === '') {
    return 'Mobile number is required'
  }
  const digits = String(input).replace(/[^\d]/g, '')
  if (digits.length < 10) return 'Mobile number must have 10 digits'
  if (digits.length > 13) return 'Mobile number is too long'
  if (normalizeMobile(input) === null) {
    return 'Enter a valid Indian mobile number (must start with 6, 7, 8 or 9)'
  }
  return ''
}
