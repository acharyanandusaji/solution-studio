import { acquireToken } from './auth'
import { getBrokerToken } from './broker'
import type { CloudConfig } from './types'

/**
 * Converts an OAuth scope into the Azure resource the broker should request.
 *
 *   https://org.crm9.dynamics.com/user_impersonation  -> https://org.crm9.dynamics.com
 *   https://api.powerplatform.com/.default            -> https://api.powerplatform.com
 *   https://service.powerapps.com//.default           -> https://service.powerapps.com
 */
export function resourceForScopes(scopes: string[]): string {
  const scope = scopes.find((value) => value.trim().length > 0)?.trim() ?? ''
  let url: URL
  try {
    url = new URL(scope)
  } catch {
    throw new Error(`Cannot map the scope "${scope}" to an Azure resource.`)
  }

  let pathname = url.pathname.replace(/\/+$/, '')
  if (/\/\.default$/i.test(pathname)) {
    pathname = pathname.slice(0, -'/.default'.length)
  } else if (/\/user_impersonation$/i.test(pathname)) {
    pathname = pathname.slice(0, -'/user_impersonation'.length)
  } else {
    pathname = ''
  }
  pathname = pathname.replace(/\/+$/, '')

  return `${url.protocol}//${url.host}${pathname}`
}

/**
 * Returns an access token for either auth mode. The rest of the cloud code only
 * sees a bearer token, so MSAL and the local broker are interchangeable.
 */
export async function acquireCloudToken(
  config: CloudConfig,
  scopes: string[],
  options: { interactive: boolean },
): Promise<string> {
  if (config.authMode === 'broker') {
    const token = await getBrokerToken(config, resourceForScopes(scopes))
    return token.accessToken
  }
  return acquireToken(config, scopes, options)
}
