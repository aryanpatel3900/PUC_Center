// Gujarati WhatsApp message templates with placeholder replacement.
//
// The message is composed of three editable parts so the owner can customise
// the greeting, the interval-specific wording and the closing independently:
//   greeting + "\n\n" + body[30|15|7] + "\n\n" + closing

export const DEFAULT_GREETING = 'નમસ્તે {{customerName}} ભાઈ,'

export const DEFAULT_BODIES = {
  30:
    'આપના વાહન નંબર {{vehicleNumber}} ના PUC સર્ટિફિકેટની મુદત {{expiryDate}} ના રોજ પૂર્ણ થવાની છે.\n\n' +
    'આપના PUC સર્ટિફિકેટની મુદત પૂર્ણ થવામાં હજુ 30 દિવસ બાકી છે. કૃપા કરીને સમયસર PUC રિન્યુ કરાવી લેશો.',
  15:
    'આપના વાહન નંબર {{vehicleNumber}} ના PUC સર્ટિફિકેટની મુદત {{expiryDate}} ના રોજ પૂર્ણ થવાની છે.\n\n' +
    'આપના PUC સર્ટિફિકેટની મુદત પૂર્ણ થવામાં હવે 15 દિવસ બાકી છે. કૃપા કરીને સમયસર PUC રિન્યુ કરાવી લેશો.',
  7:
    'આપના વાહન નંબર {{vehicleNumber}} ના PUC સર્ટિફિકેટની મુદત {{expiryDate}} ના રોજ પૂર્ણ થવાની છે.\n\n' +
    'આપના PUC સર્ટિફિકેટની મુદત પૂર્ણ થવામાં હવે માત્ર 7 દિવસ બાકી છે. કૃપા કરીને વહેલી તકે PUC રિન્યુ કરાવી લેશો.',
}

export const DEFAULT_CLOSING = 'આભાર!\n{{centerName}}'

export const PLACEHOLDER_HELP = [
  { token: '{{customerName}}', desc: 'Customer name' },
  { token: '{{vehicleNumber}}', desc: 'Vehicle registration number' },
  { token: '{{expiryDate}}', desc: 'PUC expiry date (DD/MM/YYYY)' },
  { token: '{{centerName}}', desc: 'Your PUC center name' },
  { token: '{{centerContact}}', desc: 'Your center contact number' },
  { token: '{{centerAddress}}', desc: 'Your center address' },
]

function replaceToken(text, token, value) {
  return text.split(token).join(value)
}

function formatExpiry(iso) {
  if (!iso || typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/**
 * Build the final WhatsApp message for a customer + interval.
 * Never leaves literal {{placeholders}} in the output.
 */
export function buildMessage({ interval, customer, settings }) {
  const templates = settings?.templates || {}
  const greeting = templates.greeting ?? DEFAULT_GREETING
  const body = (templates.bodies && templates.bodies[interval]) || DEFAULT_BODIES[interval] || DEFAULT_BODIES[7]
  const closing = templates.closing ?? DEFAULT_CLOSING

  const name = (customer?.name || '').trim()
  let msg = `${greeting}\n\n${body}\n\n${closing}`

  // A missing name must not produce "નમસ્તે ભાઈ," — collapse it gracefully.
  if (!name && greeting.includes('{{customerName}}')) {
    msg = replaceToken(msg, '{{customerName}}', '\u0001')
    msg = msg.replace(/નમસ્તે\s*\u0001\s*ભાઈ,/g, 'નમસ્તે,')
  }

  msg = replaceToken(msg, '{{customerName}}', name || 'મિત્ર')
  msg = replaceToken(msg, '{{vehicleNumber}}', (customer?.vehicleNumber || '').trim() || '—')
  msg = replaceToken(msg, '{{expiryDate}}', customer?.pucExpiryDateDisplay || formatExpiry(customer?.pucExpiryDate))
  msg = replaceToken(msg, '{{centerName}}', (settings?.centerName || '').trim() || 'PUC Center')
  msg = replaceToken(msg, '{{centerContact}}', (settings?.contactNumber || '').trim() || '—')
  msg = replaceToken(msg, '{{centerAddress}}', (settings?.address || '').trim() || '—')

  // Safety net: strip any unknown leftover placeholder and tidy whitespace.
  msg = msg.replace(/\s*\{\{[a-zA-Z0-9]+\}\}\s*/g, ' ')
  msg = msg.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return msg
}

/** Default template parts (used by Settings "reset to default"). */
export function defaultTemplates() {
  return {
    greeting: DEFAULT_GREETING,
    bodies: { ...DEFAULT_BODIES },
    closing: DEFAULT_CLOSING,
  }
}
