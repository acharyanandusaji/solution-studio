import { DEFAULT_BROKER_URL, isBrokerConfigured, normalizeBrokerUrl } from './broker'
import type { CloudAuthMode, CloudConfig } from './types'

const CONFIG_KEY = 'solution-studio:cloud-config:v1'

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const DEFAULT_CLOUD_CONFIG: CloudConfig = {
  authMode: 'broker',
  clientId: '',
  tenantId: 'organizations',
  brokerUrl: DEFAULT_BROKER_URL,
  brokerKey: '',
}

function isGuid(value: string): boolean {
  return GUID.test(value.trim())
}

function normalizeAuthMode(value: unknown, clientId: string): CloudAuthMode {
  if (value === 'broker' || value === 'entra') return value
  // Configs written before the broker existed only had a client ID.
  return isGuid(clientId) ? 'entra' : 'broker'
}

export function getCloudConfig(): CloudConfig {
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY)
    if (!raw) return { ...DEFAULT_CLOUD_CONFIG }
    const parsed = JSON.parse(raw) as Partial<CloudConfig>
    const clientId = typeof parsed.clientId === 'string' ? parsed.clientId.trim() : ''

    let brokerUrl = DEFAULT_BROKER_URL
    if (typeof parsed.brokerUrl === 'string' && parsed.brokerUrl.trim()) {
      try {
        brokerUrl = normalizeBrokerUrl(parsed.brokerUrl)
      } catch {
        brokerUrl = DEFAULT_BROKER_URL
      }
    }

    return {
      authMode: normalizeAuthMode(parsed.authMode, clientId),
      clientId,
      tenantId:
        typeof parsed.tenantId === 'string' && parsed.tenantId.trim()
          ? parsed.tenantId.trim()
          : DEFAULT_CLOUD_CONFIG.tenantId,
      brokerUrl,
      brokerKey: typeof parsed.brokerKey === 'string' ? parsed.brokerKey.trim() : '',
    }
  } catch {
    return { ...DEFAULT_CLOUD_CONFIG }
  }
}

export function saveCloudConfig(config: CloudConfig): void {
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch {
    // Configuration is a convenience. The session still works without persistence.
  }
}

export function clearCloudConfig(): void {
  try {
    window.localStorage.removeItem(CONFIG_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function isCloudConfigured(config: CloudConfig): boolean {
  if (config.authMode === 'broker') return isBrokerConfigured(config)
  return isGuid(config.clientId)
}

/**
 * The redirect URI registered in Entra. Uses the deployment base path so the
 * same build works at the domain root and on GitHub Pages project sites.
 *
 * Vite's base is relative (`./`), so the base is resolved against the current
 * document path instead of being appended to the origin.
 */
export function cloudRedirectUri(): string {
  const base = import.meta.env.BASE_URL || '/'
  const ensureSlash = (value: string) => (value.endsWith('/') ? value : `${value}/`)

  if (/^https?:\/\//i.test(base)) return ensureSlash(base)

  const path = window.location.pathname || '/'
  const directory = path.endsWith('/') ? path : path.replace(/[^/]*$/, '')
  return `${window.location.origin}${ensureSlash(directory)}`
}

export function authorityFor(tenantId: string): string {
  const tenant = tenantId.trim() || DEFAULT_CLOUD_CONFIG.tenantId
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}`
}
