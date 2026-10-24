// WhatsApp click-to-chat helpers.
//
// This application uses ONLY the official WhatsApp "click to chat" URL format.
// There is no automation, no bulk sending and no unofficial API. The owner
// reviews each message in WhatsApp and presses Send manually.

import { normalizeMobile } from './phoneUtils'

/** Build https://wa.me/<91XXXXXXXXXX>?text=<encoded message>. */
export function buildWaLink(mobile, message) {
  const normalized = normalizeMobile(mobile)
  if (!normalized) return null
  const text = encodeURIComponent(String(message || ''))
  return `https://wa.me/91${normalized}?text=${text}`
}

/**
 * Open a prefilled WhatsApp chat in a new tab.
 * Returns { ok, link, error }. Opening the link NEVER marks a reminder sent —
 * the owner must confirm separately.
 */
export function openWhatsApp(mobile, message) {
  const normalized = normalizeMobile(mobile)
  if (!normalized) {
    return { ok: false, link: null, error: 'Invalid mobile number. Fix the number before opening WhatsApp.' }
  }
  const link = buildWaLink(normalized, message)
  try {
    window.open(link, '_blank', 'noopener,noreferrer')
    return { ok: true, link, error: null }
  } catch (e) {
    return { ok: false, link, error: 'Could not open WhatsApp. Please allow pop-ups for this page.' }
  }
}
