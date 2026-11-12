import type { CloudConfig } from './types'

/** Matches the defaults in tools/token-broker.mjs. */
export const DEFAULT_BROKER_URL = 'http://127.0.0.1:4319'
export const BROKER_KEY_HEADER = 'X-Broker-Key'

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i

export interface BrokerAccount {
  name: string
  username: string
  tenantId: string
  userType: string
}

export interface BrokerToken {
  accessToken: string
  resource: string
  expiresOn?: string
  cached: boolean
}

export class BrokerError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status = 0, code = 'broker_error') {
    super(message)
    this.name = 'BrokerError'
    this.status = status
    this.code = code
  }
}

/**
 * Accepts `127.0.0.1:4319`, `http://localhost:4319/` and similar, and returns a
 * canonical origin. Only loopback hosts are allowed because that is where the
 * broker listens.
 */
export function normalizeBrokerUrl(value: string): string {
  const raw = value.trim() || DEFAULT_BROKER_URL
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`

  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    throw new BrokerError('Enter a valid broker URL, for example http://127.0.0.1:4319.', 0, 'invalid_url')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BrokerError('The broker URL must use http or https.', 0, 'invalid_url')
  }
  if (!LOOPBACK_HOST.test(url.hostname)) {
    throw new BrokerError(
      'The broker URL must point at localhost or 127.0.0.1. The helper only listens on your machine.',
      0,
      'invalid_url',
    )
  }
  if (url.pathname && url.pathname !== '/') {
    throw new BrokerError('Use the broker origin without a path, for example http://127.0.0.1:4319.', 0, 'invalid_url')
  }

  return url.origin
}

export function isBrokerUrl(value: string): boolean {
  try {
    normalizeBrokerUrl(value)
    return true
  } catch {
    return false
  }
}

export function isBrokerConfigured(config: CloudConfig): boolean {
  return (
    config.authMode === 'broker' &&
    isBrokerUrl(config.brokerUrl) &&
    config.brokerKey.trim().length > 0
  )
}

interface BrokerErrorPayload {
  error?: {
    code?: string
    message?: string
  }
}

async function brokerRequest<T>(config: CloudConfig, path: string): Promise<T> {
  const base = normalizeBrokerUrl(config.brokerUrl)
  const key = config.brokerKey.trim()
  if (!key) {
    throw new BrokerError('Enter the broker key printed in the terminal.', 0, 'missing_key')
  }

  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        [BROKER_KEY_HEADER]: key,
      },
      cache: 'no-store',
    })
  } catch {
    throw new BrokerError(
      `Could not reach the token broker at ${base}. Start it with "node tools/token-broker.mjs", then check the URL and key.`,
      0,
      'unreachable',
    )
  }

  const text = await response.text().catch(() => '')
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const error = (payload as BrokerErrorPayload | null)?.error
    throw new BrokerError(
      error?.message || `${response.status} ${response.statusText}`,
      response.status,
      error?.code || 'broker_error',
    )
  }

  if (!payload || typeof payload !== 'object') {
    throw new BrokerError('The broker returned an unexpected response.', response.status, 'invalid_response')
  }

  return payload as T
}

export async function checkBroker(config: CloudConfig): Promise<void> {
  await brokerRequest<{ ok?: boolean }>(config, '/health')
}

export async function getBrokerAccount(config: CloudConfig): Promise<BrokerAccount> {
  const payload = await brokerRequest<{ account?: Record<string, unknown> }>(config, '/account')
  const account = payload.account ?? {}
  const username =
    typeof account.username === 'string'
      ? account.username
      : typeof account.name === 'string'
        ? account.name
        : ''
  return {
    name: typeof account.name === 'string' && account.name ? account.name : username,
    username,
    tenantId: typeof account.tenantId === 'string' ? account.tenantId : '',
    userType: typeof account.userType === 'string' ? account.userType : '',
  }
}

export async function getBrokerToken(config: CloudConfig, resource: string): Promise<BrokerToken> {
  const query = new URLSearchParams({ resource })
  const payload = await brokerRequest<{
    accessToken?: string
    resource?: string
    expiresOn?: string
    cached?: boolean
  }>(config, `/token?${query.toString()}`)

  if (typeof payload.accessToken !== 'string' || !payload.accessToken) {
    throw new BrokerError('The broker returned no access token.', 0, 'empty_token')
  }

  return {
    accessToken: payload.accessToken,
    resource: typeof payload.resource === 'string' ? payload.resource : resource,
    expiresOn: typeof payload.expiresOn === 'string' ? payload.expiresOn : undefined,
    cached: Boolean(payload.cached),
  }
}
