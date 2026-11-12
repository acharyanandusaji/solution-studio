import { PublicClientApplication } from '@azure/msal-browser'
import type { AccountInfo, Configuration } from '@azure/msal-browser'
import { authorityFor, cloudRedirectUri, isCloudConfigured } from './config'
import type { CloudConfig } from './types'

/**
 * Delegated scope for the current Power Platform API (api.powerplatform.com).
 * Requires the `EnvironmentManagement.Environments.Read` permission.
 */
export const POWER_PLATFORM_SCOPES = ['https://api.powerplatform.com/.default']

/**
 * Legacy BAP admin API scope, used as a fallback for app registrations that
 * only have the older Power Apps Service permission. The double slash is the
 * resource's canonical scope form.
 */
export const LEGACY_POWER_PLATFORM_SCOPES = ['https://service.powerapps.com//.default']

/** Identity scopes only, so sign-in succeeds before any API consent is granted. */
const LOGIN_SCOPES = ['openid', 'profile', 'offline_access']

/**
 * Sign-in requests the API scope so the first token is cached during the same
 * popup. Registrations that lack the current permission retry with the legacy
 * scope, then with identity scopes only (Dataverse can still be used manually).
 */
const SIGN_IN_SCOPES = [POWER_PLATFORM_SCOPES, LEGACY_POWER_PLATFORM_SCOPES, LOGIN_SCOPES]

function isScopeConsentError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as {
    errorCode?: string
    errorMessage?: string
    message?: string
    subError?: string
  }
  const text = [
    candidate.errorCode,
    candidate.errorMessage,
    candidate.message,
    candidate.subError,
  ]
    .filter(Boolean)
    .join(' ')
  return /consent_required|invalid_scope|AADSTS65001|AADSTS70011/i.test(text)
}

export function dataverseScopes(orgUrl: string): string[] {
  return [`${orgUrl.replace(/\/+$/, '')}/user_impersonation`]
}

const instances = new Map<string, Promise<PublicClientApplication>>()

function msalConfiguration(config: CloudConfig): Configuration {
  return {
    auth: {
      clientId: config.clientId.trim(),
      authority: authorityFor(config.tenantId),
      redirectUri: cloudRedirectUri(),
      postLogoutRedirectUri: cloudRedirectUri(),
    },
    cache: {
      cacheLocation: 'sessionStorage',
    },
  }
}

async function getClient(config: CloudConfig): Promise<PublicClientApplication> {
  if (!isCloudConfigured(config)) {
    throw new Error('Add your Entra application (client) ID before signing in.')
  }
  const key = `${config.clientId.trim()}|${config.tenantId.trim()}|${cloudRedirectUri()}`
  let pending = instances.get(key)
  if (!pending) {
    pending = (async () => {
      const client = new PublicClientApplication(msalConfiguration(config))
      await client.initialize()
      try {
        await client.handleRedirectPromise()
      } catch {
        // A stale redirect response should not block a popup sign-in.
      }
      const accounts = client.getAllAccounts()
      if (accounts.length > 0 && !client.getActiveAccount()) {
        client.setActiveAccount(accounts[0])
      }
      return client
    })()
    instances.set(key, pending)
  }
  return pending
}

export async function getActiveAccount(config: CloudConfig): Promise<AccountInfo | null> {
  if (!isCloudConfigured(config)) return null
  try {
    const client = await getClient(config)
    const account = client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null
    if (account && !client.getActiveAccount()) client.setActiveAccount(account)
    return account
  } catch {
    return null
  }
}

export async function signIn(config: CloudConfig): Promise<AccountInfo> {
  const client = await getClient(config)
  let firstScopeError: unknown
  for (const scopes of SIGN_IN_SCOPES) {
    try {
      const result = await client.loginPopup({ scopes })
      client.setActiveAccount(result.account)
      return result.account
    } catch (error) {
      if (!isScopeConsentError(error)) {
        throw firstScopeError ?? error
      }
      firstScopeError ??= error
    }
  }
  throw firstScopeError
}

export async function signOut(config: CloudConfig): Promise<void> {
  const client = await getClient(config)
  client.setActiveAccount(null)
  await client.clearCache()
}

/**
 * Returns an access token for the requested resource. Silent first, then an
 * interactive popup when the caller is responding to a user action.
 */
export async function acquireToken(
  config: CloudConfig,
  scopes: string[],
  options: { interactive: boolean },
): Promise<string> {
  const client = await getClient(config)
  const account = client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null
  if (!account) {
    throw new Error('Sign in to Microsoft first.')
  }
  try {
    const result = await client.acquireTokenSilent({ scopes, account })
    return result.accessToken
  } catch (error) {
    if (!options.interactive) throw error
    const result = await client.acquireTokenPopup({ scopes, account })
    client.setActiveAccount(result.account)
    return result.accessToken
  }
}

export function describeAuthError(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as {
      errorCode?: string
      errorMessage?: string
      message?: string
      subError?: string
    }
    const message = candidate.errorMessage || candidate.message
    if (message) {
      const prefix = candidate.errorCode ? `${candidate.errorCode}: ` : ''
      return `${prefix}${message}`
    }
  }
  return error instanceof Error ? error.message : String(error)
}
