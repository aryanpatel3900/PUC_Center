import { describe, it, expect } from 'vitest'
import { buildMessage, DEFAULT_BODIES } from '../messageTemplates'
import { buildWaLink } from '../whatsappUtils'

const settings = {
  centerName: 'Shree PUC Center',
  contactNumber: '9876543210',
  address: 'Station Road, Rajkot',
  templates: undefined, // use defaults
}

const customer = {
  name: 'રમેશ પટેલ',
  vehicleNumber: 'GJ01AB1234',
  pucExpiryDate: '2026-12-30',
}

describe('Gujarati message building', () => {
  it('replaces every placeholder with real data', () => {
    const msg = buildMessage({ interval: 30, customer, settings })
    expect(msg).not.toContain('{{')
    expect(msg).toContain('રમેશ પટેલ')
    expect(msg).toContain('GJ01AB1234')
    expect(msg).toContain('30/12/2026') // expiry formatted DD/MM/YYYY
    expect(msg).toContain('Shree PUC Center')
  })

  it('uses the correct default wording per interval', () => {
    expect(buildMessage({ interval: 30, customer, settings })).toContain('હજુ 30 દિવસ બાકી છે')
    expect(buildMessage({ interval: 15, customer, settings })).toContain('હવે 15 દિવસ બાકી છે')
    expect(buildMessage({ interval: 7, customer, settings })).toContain('માત્ર 7 દિવસ બાકી છે')
  })

  it('handles a missing customer name gracefully', () => {
    const msg = buildMessage({ interval: 30, customer: { ...customer, name: '' }, settings })
    expect(msg).not.toContain('{{')
    expect(msg).not.toMatch(/નમસ્તે\s*ભાઈ,/) // no dangling "ભાઈ" without a name
    expect(msg.startsWith('નમસ્તે,')).toBe(true)
  })

  it('falls back to safe values when customer fields are missing', () => {
    const msg = buildMessage({ interval: 15, customer: { name: 'Test', vehicleNumber: '', pucExpiryDate: '' }, settings })
    expect(msg).not.toContain('{{')
    expect(msg).not.toContain('undefined')
  })

  it('default bodies match the specification templates', () => {
    expect(DEFAULT_BODIES[30]).toContain('હજુ 30 દિવસ બાકી છે')
    expect(DEFAULT_BODIES[15]).toContain('હવે 15 દિવસ બાકી છે')
    expect(DEFAULT_BODIES[7]).toContain('વહેલી તકે')
  })
})

describe('WhatsApp click-to-chat links', () => {
  it('builds the official wa.me URL with country code 91', () => {
    const link = buildWaLink('9876543210', 'hello')
    expect(link).toBe('https://wa.me/919876543210?text=hello')
  })

  it('TEST 8: Gujarati text and special characters are URL-encoded correctly', () => {
    const msg = buildMessage({ interval: 30, customer, settings })
    const link = buildWaLink('+91 98765 43210', msg)
    expect(link.startsWith('https://wa.me/919876543210?text=')).toBe(true)
    const encoded = link.split('?text=')[1]
    // No raw Gujarati or spaces may appear in the query string.
    expect(encoded).not.toMatch(/[\sઅ-૿]/)
    expect(decodeURIComponent(encoded)).toBe(msg)
  })

  it('TEST 9: invalid mobile numbers never produce a WhatsApp link', () => {
    expect(buildWaLink('12345', 'hello')).toBeNull()
    expect(buildWaLink('', 'hello')).toBeNull()
    expect(buildWaLink(null, 'hello')).toBeNull()
    expect(buildWaLink('abcdefghij', 'hello')).toBeNull()
  })
})
