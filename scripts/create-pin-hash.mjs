#!/usr/bin/env node
// Generates a salted PBKDF2 verifier for the 4-digit unlock PIN.
//
//   npm run pin:hash            (asks for the PIN interactively)
//   npm run pin:hash -- 4821    (or pass it as an argument)
//
// The PIN itself is never stored or printed — only the verifier, which you
// save as the PIN_VERIFIER secret in Supabase (Dashboard → Edge Functions →
// Secrets, or `supabase secrets set`). Keep the PIN itself private; anyone
// who knows it can unlock the app.

import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'

// Must match ITERATIONS in supabase/functions/puc-unlock/index.ts.
const ITERATIONS = 100_000
const SALT_BYTES = 16
const KEY_BYTES = 32

async function readPin() {
  const arg = process.argv[2]
  if (arg !== undefined) return String(arg).trim()
  if (!process.stdin.isTTY) {
    console.error('No TTY available. Pass the PIN as an argument: npm run pin:hash -- 4821')
    process.exit(1)
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question('Choose a 4-digit PIN: ')).trim()
  } finally {
    rl.close()
  }
}

const pin = await readPin()
if (!/^\d{4}$/.test(pin)) {
  console.error('The PIN must be exactly 4 digits (for example 4821).')
  process.exit(1)
}

const salt = randomBytes(SALT_BYTES)
const hash = pbkdf2Sync(pin, salt, ITERATIONS, KEY_BYTES, 'sha256')
const verifier = `${salt.toString('hex')}:${hash.toString('hex')}`

console.log('')
console.log('PIN verifier created. The PIN itself was NOT stored or printed.')
console.log('')
console.log('Next steps:')
console.log('  1. Open Supabase Dashboard → Project → Edge Functions → Secrets')
console.log('     (or run: npx supabase secrets set)')
console.log('  2. Add these three secrets:')
console.log('')
console.log(`     PIN_VERIFIER=${verifier}`)
console.log('     APP_EMAIL=your-authorized-account-email')
console.log('     APP_PASSWORD=that-accounts-password')
console.log('')
console.log('  3. Deploy the function:  npx supabase functions deploy puc-unlock')
console.log('')
