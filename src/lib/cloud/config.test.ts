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

const ENTRA_CONFIG = {
  authMode: 'entra' as const,
  clientId: '11111111-1111-1111-1111-111111111111',
  tenantId: 'organizations',
  brokerUrl: 'http://127.0.0.1:4319',
  brokerKey: '',
}

const BROKER_CONFIG = {
  authMode: 'broker' as const,
  clientId: '',
  tenantId: 'organizations',
  brokerUrl: 'http://127.0.0.1:4319',
  brokerKey: 'a'.repeat(32),
}

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
    expect(DEFAULT_CLOUD_CONFIG.authMode).toBe('broker')
  })

  it('saves and reads an Entra configuration', () => {
    installStorage()
    saveCloudConfig({
      ...ENTRA_CONFIG,
      clientId: '  11111111-1111-1111-1111-111111111111  ',
      tenantId: 'contoso.onmicrosoft.com',
    })
    expect(getCloudConfig()).toEqual({
      ...ENTRA_CONFIG,
      tenantId: 'contoso.onmicrosoft.com',
    })
  })

  it('saves and reads a broker configuration', () => {
    installStorage()
    saveCloudConfig({ ...BROKER_CONFIG, brokerUrl: '127.0.0.1:4319/', brokerKey: `  ${BROKER_CONFIG.brokerKey}  ` })
    expect(getCloudConfig()).toEqual(BROKER_CONFIG)
  })

  it('falls back to organizations for an empty tenant', () => {
    installStorage()
    saveCloudConfig({ ...ENTRA_CONFIG, tenantId: '   ' })
    expect(getCloudConfig().tenantId).toBe('organizations')
  })

  it('recovers from malformed stored JSON', () => {
    installStorage({ 'solution-studio:cloud-config:v1': '{not-json' })
    expect(getCloudConfig()).toEqual(DEFAULT_CLOUD_CONFIG)
  })

  it('clears the stored configuration', () => {
    const data = installStorage()
    saveCloudConfig(ENTRA_CONFIG)
    clearCloudConfig()
    expect(data.size).toBe(0)
  })

  it('treats pre-broker configs with a client ID as Entra mode', () => {
    installStorage({
      'solution-studio:cloud-config:v1': JSON.stringify({
        clientId: '11111111-1111-1111-1111-111111111111',
        tenantId: 'organizations',
      }),
    })
    const config = getCloudConfig()
    expect(config.authMode).toBe('entra')
    expect(config.brokerKey).toBe('')
  })

  it('treats pre-broker configs without a client ID as broker mode', () => {
    installStorage({
      'solution-studio:cloud-config:v1': JSON.stringify({ clientId: '', tenantId: 'organizations' }),
    })
    expect(getCloudConfig().authMode).toBe('broker')
  })

  it('rejects an invalid stored broker URL', () => {
    installStorage({
      'solution-studio:cloud-config:v1': JSON.stringify({ ...BROKER_CONFIG, brokerUrl: 'https://example.com' }),
    })
    expect(getCloudConfig().brokerUrl).toBe('http://127.0.0.1:4319')
  })

  it('only accepts GUID-shaped client IDs in Entra mode', () => {
    expect(isCloudConfigured({ ...ENTRA_CONFIG, clientId: '' })).toBe(false)
    expect(isCloudConfigured({ ...ENTRA_CONFIG, clientId: 'solution-studio' })).toBe(false)
    expect(isCloudConfigured(ENTRA_CONFIG)).toBe(true)
  })

  it('requires a loopback URL and a key in broker mode', () => {
    expect(isCloudConfigured({ ...BROKER_CONFIG, brokerKey: '' })).toBe(false)
    expect(isCloudConfigured({ ...BROKER_CONFIG, brokerUrl: 'https://example.com' })).toBe(false)
    expect(isCloudConfigured({ ...BROKER_CONFIG, brokerUrl: 'http://localhost:4319' })).toBe(true)
    expect(isCloudConfigured(BROKER_CONFIG)).toBe(true)
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
