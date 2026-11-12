import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authorityFor,
  clearCloudConfig,
  cloudRedirectUri,
  DEFAULT_CLOUD_CONFIG,
  getCloudConfig,
  isCloudConfigured,
  saveCloudConfig,
} from './config'

function installStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
  vi.stubGlobal('window', { localStorage: storage })
  return data
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cloud config', () => {
  it('returns defaults when nothing is stored', () => {
    installStorage()
    expect(getCloudConfig()).toEqual(DEFAULT_CLOUD_CONFIG)
  })

  it('saves and reads the configuration', () => {
    installStorage()
    saveCloudConfig({ clientId: '  11111111-1111-1111-1111-111111111111  ', tenantId: 'contoso.onmicrosoft.com' })
    expect(getCloudConfig()).toEqual({
      clientId: '11111111-1111-1111-1111-111111111111',
      tenantId: 'contoso.onmicrosoft.com',
    })
  })

  it('falls back to organizations for an empty tenant', () => {
    installStorage()
    saveCloudConfig({ clientId: '11111111-1111-1111-1111-111111111111', tenantId: '   ' })
    expect(getCloudConfig().tenantId).toBe('organizations')
  })

  it('recovers from malformed stored JSON', () => {
    installStorage({ 'solution-studio:cloud-config:v1': '{not-json' })
    expect(getCloudConfig()).toEqual(DEFAULT_CLOUD_CONFIG)
  })

  it('clears the stored configuration', () => {
    const data = installStorage()
    saveCloudConfig({ clientId: '11111111-1111-1111-1111-111111111111', tenantId: 'organizations' })
    clearCloudConfig()
    expect(data.size).toBe(0)
  })

  it('only accepts GUID-shaped client IDs', () => {
    expect(isCloudConfigured({ clientId: '', tenantId: 'organizations' })).toBe(false)
    expect(isCloudConfigured({ clientId: 'solution-studio', tenantId: 'organizations' })).toBe(false)
    expect(
      isCloudConfigured({
        clientId: '11111111-1111-1111-1111-111111111111',
        tenantId: 'organizations',
      }),
    ).toBe(true)
  })

  it('builds an encoded authority URL', () => {
    expect(authorityFor('organizations')).toBe('https://login.microsoftonline.com/organizations')
    expect(authorityFor('contoso.onmicrosoft.com')).toBe(
      'https://login.microsoftonline.com/contoso.onmicrosoft.com',
    )
  })

  it('resolves a relative base to the current page directory', () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost:4173', pathname: '/solution-studio/' },
    })
    expect(cloudRedirectUri()).toBe('http://localhost:4173/solution-studio/')
  })

  it('resolves an index.html path to its directory', () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost:4173', pathname: '/solution-studio/index.html' },
    })
    expect(cloudRedirectUri()).toBe('http://localhost:4173/solution-studio/')
  })
})
