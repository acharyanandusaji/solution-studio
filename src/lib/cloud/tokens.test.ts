import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth', () => ({
  acquireToken: vi.fn(async () => 'entra-token'),
}))

import { acquireToken } from './auth'
import { acquireCloudToken, resourceForScopes } from './tokens'
import type { CloudConfig } from './types'

const BROKER: CloudConfig = {
  authMode: 'broker',
  clientId: '',
  tenantId: 'organizations',
  brokerUrl: 'http://127.0.0.1:4319',
  brokerKey: 'secret-key-1234567890',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(acquireToken).mockClear()
})

describe('resourceForScopes', () => {
  it('maps Dataverse user_impersonation scopes to the org URL', () => {
    expect(resourceForScopes(['https://org.crm9.dynamics.com/user_impersonation'])).toBe(
      'https://org.crm9.dynamics.com',
    )
  })

  it('maps .default scopes to the service origin', () => {
    expect(resourceForScopes(['https://api.powerplatform.com/.default'])).toBe(
      'https://api.powerplatform.com',
    )
    expect(resourceForScopes(['https://service.powerapps.com//.default'])).toBe(
      'https://service.powerapps.com',
    )
  })

  it('rejects scopes that are not URLs', () => {
    expect(() => resourceForScopes(['openid'])).toThrow(/Cannot map the scope/)
  })
})

describe('acquireCloudToken', () => {
  it('uses the broker in broker mode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ accessToken: 'broker-token', resource: 'https://api.powerplatform.com' }),
    })))

    await expect(
      acquireCloudToken(BROKER, ['https://api.powerplatform.com/.default'], { interactive: false }),
    ).resolves.toBe('broker-token')
    expect(acquireToken).not.toHaveBeenCalled()
  })

  it('delegates to MSAL in Entra mode', async () => {
    await expect(
      acquireCloudToken(
        { ...BROKER, authMode: 'entra', clientId: '11111111-1111-1111-1111-111111111111' },
        ['https://api.powerplatform.com/.default'],
        { interactive: true },
      ),
    ).resolves.toBe('entra-token')
    expect(acquireToken).toHaveBeenCalledOnce()
  })
})
