import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ENVIRONMENTS_URL,
  EnvironmentDiscoveryError,
  LEGACY_ENVIRONMENTS_URL,
  listEnvironments,
  listEnvironmentsLegacy,
  normalizeEnvironment,
} from './powerplatform'

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => '',
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeEnvironment', () => {
  it('reads instance URL and metadata from environment properties', () => {
    expect(
      normalizeEnvironment({
        name: 'env-123',
        properties: {
          displayName: 'Contoso Dev',
          instanceUrl: 'https://orga3a385f0.crm9.dynamics.com/',
          environmentType: 'Sandbox',
          state: 'Ready',
          isDefault: true,
        },
      }),
    ).toEqual({
      id: 'env-123',
      displayName: 'Contoso Dev',
      instanceUrl: 'https://orga3a385f0.crm9.dynamics.com',
      environmentType: 'Sandbox',
      state: 'Ready',
      isDefault: true,
    })
  })

  it('reads the current Power Platform API shape', () => {
    expect(
      normalizeEnvironment({
        id: '00000000-0000-0000-0000-000000000001',
        displayName: 'CDPH Dev',
        url: 'https://cdph-mainsite-dev.crm9.dynamics.com/',
        type: 'Sandbox',
        state: 'Ready',
      }),
    ).toEqual({
      id: '00000000-0000-0000-0000-000000000001',
      displayName: 'CDPH Dev',
      instanceUrl: 'https://cdph-mainsite-dev.crm9.dynamics.com',
      environmentType: 'Sandbox',
      state: 'Ready',
      isDefault: false,
    })
  })

  it('falls back to the host name when no display name is present', () => {
    expect(
      normalizeEnvironment({
        id: '/providers/environments/env-456',
        properties: { instanceUrl: 'https://cdph-mainsite-dev.crm9.dynamics.com' },
      }),
    ).toMatchObject({
      id: '/providers/environments/env-456',
      displayName: 'cdph-mainsite-dev.crm9.dynamics.com',
      instanceUrl: 'https://cdph-mainsite-dev.crm9.dynamics.com',
    })
  })

  it('supports flattened payloads', () => {
    expect(
      normalizeEnvironment({
        id: 'env-789',
        name: 'Contoso Prod',
        instanceUrl: 'https://contoso.crm.dynamics.com',
        environmentSku: 'Production',
      }),
    ).toMatchObject({
      id: 'Contoso Prod',
      displayName: 'Contoso Prod',
      environmentType: 'Production',
    })
  })

  it('skips environments without an instance URL', () => {
    expect(normalizeEnvironment({ name: 'env-empty', properties: {} })).toBeNull()
  })
})

describe('listEnvironments', () => {
  it('collects and paginates current API responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          value: [{ id: 'b', displayName: 'Beta', url: 'https://beta.crm.dynamics.com' }],
          '@odata.nextlink': 'https://api.powerplatform.com/next',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          value: [{ id: 'a', displayName: 'Alpha', url: 'https://alpha.crm.dynamics.com/' }],
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const environments = await listEnvironments('token')

    expect(environments.map((environment) => environment.displayName)).toEqual(['Alpha', 'Beta'])
    expect(environments[0].instanceUrl).toBe('https://alpha.crm.dynamics.com')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe(ENVIRONMENTS_URL)
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.powerplatform.com/next')
  })

  it('uses the legacy endpoint for the fallback call', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          {
            name: 'env-legacy',
            properties: { displayName: 'Legacy', instanceUrl: 'https://legacy.crm.dynamics.com' },
          },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const environments = await listEnvironmentsLegacy('token')

    expect(environments).toHaveLength(1)
    expect(fetchMock.mock.calls[0][0]).toBe(LEGACY_ENVIRONMENTS_URL)
  })

  it('reports the HTTP status and permission hint on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      }),
    )

    const error = await listEnvironments('token').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(EnvironmentDiscoveryError)
    expect(error).toMatchObject({ status: 403, endpoint: 'current' })
    expect((error as Error).message).toContain('EnvironmentManagement.Environments.Read')
  })
})
