import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock, setSessionMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  setSessionMock: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    functions: { invoke: invokeMock },
    auth: { setSession: setSessionMock },
  }),
}))

async function loadConfiguredClient() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
  return import('../supabaseClient')
}

describe('unlockWithPin', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    setSessionMock.mockReset()
    vi.unstubAllEnvs()
  })

  it('rejects a PIN that is not exactly 4 digits without calling the service', async () => {
    const { unlockWithPin } = await loadConfiguredClient()
    expect((await unlockWithPin('12')).error).toContain('4 digits')
    expect((await unlockWithPin('12345')).error).toContain('4 digits')
    expect((await unlockWithPin('12a4')).error).toContain('4 digits')
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('reports missing configuration instead of sending the PIN', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const { unlockWithPin } = await import('../supabaseClient')
    expect(await unlockWithPin('4821')).toEqual({ error: 'Supabase is not configured.' })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('installs the session returned by the Edge Function on success', async () => {
    invokeMock.mockResolvedValue({ data: { access_token: 'at', refresh_token: 'rt' }, error: null })
    setSessionMock.mockResolvedValue({ error: null })
    const { unlockWithPin } = await loadConfiguredClient()

    expect(await unlockWithPin('4821')).toEqual({ error: null })
    expect(invokeMock).toHaveBeenCalledWith('puc-unlock', { body: { pin: '4821' } })
    expect(setSessionMock).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' })
  })

  it('surfaces the server message when the PIN is wrong', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { context: { status: 401, json: async () => ({ error: 'Incorrect PIN.' }) } },
    })
    const { unlockWithPin } = await loadConfiguredClient()

    expect(await unlockWithPin('0000')).toEqual({ error: 'Incorrect PIN.' })
    expect(setSessionMock).not.toHaveBeenCalled()
  })

  it('explains when the unlock function is not deployed', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { context: { status: 404, json: async () => { throw new Error('empty body') } } },
    })
    const { unlockWithPin } = await loadConfiguredClient()

    const result = await unlockWithPin('4821')
    expect(result.error).toMatch(/not deployed/i)
    expect(setSessionMock).not.toHaveBeenCalled()
  })

  it('does not open a session when the function returns an error payload', async () => {
    invokeMock.mockResolvedValue({ data: { error: 'Too many attempts.' }, error: null })
    const { unlockWithPin } = await loadConfiguredClient()

    expect(await unlockWithPin('4821')).toEqual({ error: 'Too many attempts.' })
    expect(setSessionMock).not.toHaveBeenCalled()
  })
})
