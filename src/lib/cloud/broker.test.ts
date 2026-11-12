import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BrokerError,
  getBrokerAccount,
  getBrokerToken,
  isBrokerConfigured,
  normalizeBrokerUrl,
} from './broker'
import type { CloudConfig } from './types'

const BROKER: CloudConfig = {
  authMode: 'broker',
  clientId: '',
  tenantId: 'organizations',
  brokerUrl: 'http://127.0.0.1:4319',
  brokerKey: 'secret-key-1234567890',
}

function jsonResponse(body: unknown, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => JSON.stringify(body),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('broker URL', () => {
  it('normalizes common loopback forms', () => {
    expect(normalizeBrokerUrl('http://127.0.0.1:4319/')).toBe('http://127.0.0.1:4319')
    expect(normalizeBrokerUrl('localhost:4319')).toBe('http://localhost:4319')
    expect(normalizeBrokerUrl('  http://127.0.0.1:4319  ')).toBe('http://127.0.0.1:4319')
    expect(normalizeBrokerUrl('')).toBe('http://127.0.0.1:4319')
  })

  it('rejects remote hosts and paths', () => {
    expect(() => normalizeBrokerUrl('https://example.com')).toThrow(BrokerError)
    expect(() => normalizeBrokerUrl('http://127.0.0.1:4319/api')).toThrow(BrokerError)
  })

  it('requires a key and a loopback URL', () => {
    expect(isBrokerConfigured(BROKER)).toBe(true)
    expect(isBrokerConfigured({ ...BROKER, brokerKey: '   ' })).toBe(false)
    expect(isBrokerConfigured({ ...BROKER, brokerUrl: 'https://example.com' })).toBe(false)
    expect(isBrokerConfigured({ ...BROKER, authMode: 'entra' })).toBe(false)
  })
})

describe('broker requests', () => {
  it('requests a token with the key header and resource query', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        accessToken: 'token-value',
        resource: 'https://api.powerplatform.com',
        expiresOn: '2026-01-01 12:00:00.000000',
        cached: true,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const token = await getBrokerToken(BROKER, 'https://api.powerplatform.com')

    expect(token).toEqual({
      accessToken: 'token-value',
      resource: 'https://api.powerplatform.com',
      expiresOn: '2026-01-01 12:00:00.000000',
      cached: true,
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:4319/token?resource=https%3A%2F%2Fapi.powerplatform.com')
    expect(init.headers).toMatchObject({ 'X-Broker-Key': BROKER.brokerKey })
  })

  it('surfaces broker errors with their code and status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ error: { code: 'invalid_key', message: 'Missing or invalid broker key.' } }, 401, 'Unauthorized'),
    ))

    await expect(getBrokerToken(BROKER, 'https://api.powerplatform.com')).rejects.toMatchObject({
      name: 'BrokerError',
      status: 401,
      code: 'invalid_key',
      message: 'Missing or invalid broker key.',
    })
  })

  it('explains when the broker is not running', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))

    await expect(getBrokerToken(BROKER, 'https://api.powerplatform.com')).rejects.toThrow(
      /Could not reach the token broker/,
    )
  })

  it('maps the Azure CLI account payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({
        account: {
          name: 'Achary Anandu Saji',
          username: 'achary@contoso.com',
          tenantId: 'tenant-1',
          userType: 'user',
        },
      }),
    ))

    await expect(getBrokerAccount(BROKER)).resolves.toEqual({
      name: 'Achary Anandu Saji',
      username: 'achary@contoso.com',
      tenantId: 'tenant-1',
      userType: 'user',
    })
  })
})
