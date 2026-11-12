import type { CloudEnvironment } from './types'

/**
 * Current Power Platform API. Requires the delegated
 * `EnvironmentManagement.Environments.Read` permission on the app registration.
 */
export const ENVIRONMENTS_URL =
  'https://api.powerplatform.com/environmentmanagement/environments?api-version=2024-10-01'

/**
 * Legacy BAP admin API. Kept as a fallback for app registrations that only have
 * the older `Power Apps Service → user_impersonation` permission.
 */
export const LEGACY_ENVIRONMENTS_URL =
  'https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments?api-version=2020-10-01'

export type EnvironmentEndpoint = 'current' | 'legacy'

export interface RawEnvironment {
  id?: string
  name?: string
  properties?: Record<string, unknown>
  [key: string]: unknown
}

interface EnvironmentPage {
  value?: unknown
  '@odata.nextlink'?: string
  '@odata.nextLink'?: string
  nextLink?: string
}

export class EnvironmentDiscoveryError extends Error {
  readonly status: number
  readonly endpoint: EnvironmentEndpoint

  constructor(message: string, status: number, endpoint: EnvironmentEndpoint) {
    super(message)
    this.name = 'EnvironmentDiscoveryError'
    this.status = status
    this.endpoint = endpoint
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Handles both payload shapes: the current API returns a flat environment
 * object (`displayName`, `url`, `type`, `state`), while the legacy BAP API
 * nests those values under `properties`.
 */
export function normalizeEnvironment(raw: RawEnvironment): CloudEnvironment | null {
  const properties =
    raw.properties && typeof raw.properties === 'object'
      ? raw.properties
      : (raw as Record<string, unknown>)

  const instanceUrl = asString(
    properties.instanceUrl ?? properties.instanceURL ?? properties.url,
  ).replace(/\/+$/, '')
  if (!instanceUrl) return null

  const displayName =
    asString(properties.displayName) ||
    asString(raw.name) ||
    instanceUrl.replace(/^https?:\/\//i, '')

  return {
    id: asString(raw.name) || asString(raw.id) || instanceUrl,
    displayName,
    instanceUrl,
    environmentType:
      asString(properties.environmentType) ||
      asString(properties.environmentSku) ||
      asString(properties.type) ||
      undefined,
    state: asString(properties.state) || undefined,
    isDefault: properties.isDefault === true,
  }
}

function permissionHint(endpoint: EnvironmentEndpoint): string {
  return endpoint === 'current'
    ? 'Add the EnvironmentManagement.Environments.Read delegated permission to the app registration and grant admin consent, or paste an environment URL manually.'
    : 'Add the Power Apps Service user_impersonation delegated permission, or paste an environment URL manually.'
}

function truncateDetail(detail: string): string {
  const trimmed = detail.trim()
  if (!trimmed) return ''
  return trimmed.length > 400 ? ` ${trimmed.slice(0, 400)}…` : ` ${trimmed}`
}

async function fetchPage(
  url: string,
  accessToken: string,
  endpoint: EnvironmentEndpoint,
): Promise<EnvironmentPage | RawEnvironment[] | null> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new EnvironmentDiscoveryError(
      `Environment discovery failed (${response.status}). ${permissionHint(endpoint)}${truncateDetail(detail)}`,
      response.status,
      endpoint,
    )
  }

  return (await response.json().catch(() => null)) as
    | EnvironmentPage
    | RawEnvironment[]
    | null
}

function pageItems(payload: EnvironmentPage | RawEnvironment[] | null): RawEnvironment[] {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.value)) return payload.value as RawEnvironment[]
  return []
}

function pageNextLink(payload: EnvironmentPage | RawEnvironment[] | null): string | undefined {
  if (!payload || Array.isArray(payload)) return undefined
  return payload['@odata.nextlink'] || payload['@odata.nextLink'] || payload.nextLink
}

async function collectEnvironments(
  accessToken: string,
  endpoint: EnvironmentEndpoint,
): Promise<CloudEnvironment[]> {
  const collected: CloudEnvironment[] = []
  const seen = new Set<string>()
  let next: string | undefined =
    endpoint === 'legacy' ? LEGACY_ENVIRONMENTS_URL : ENVIRONMENTS_URL
  let page = 0

  while (next && page < 25) {
    const payload = await fetchPage(next, accessToken, endpoint)
    for (const item of pageItems(payload)) {
      const environment = normalizeEnvironment(item)
      if (!environment || seen.has(environment.instanceUrl)) continue
      seen.add(environment.instanceUrl)
      collected.push(environment)
    }
    next = pageNextLink(payload)
    page += 1
  }

  return collected.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export function listEnvironments(accessToken: string): Promise<CloudEnvironment[]> {
  return collectEnvironments(accessToken, 'current')
}

export function listEnvironmentsLegacy(accessToken: string): Promise<CloudEnvironment[]> {
  return collectEnvironments(accessToken, 'legacy')
}
