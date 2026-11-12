import type { DeploymentSettings } from '../../types'
import { base64ToBlob, blobToBase64 } from './encoding'
import type {
  CloudSolution,
  ImportJobHandle,
  ImportOptions,
  ImportOutcome,
  ImportProgress,
} from './types'

const API_PATH = '/api/data/v9.2'
const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 400

const SYSTEM_SOLUTIONS = new Set([
  'default',
  'active',
  'basic',
  'system',
  'componentlibrary',
  'msdyn_componentlayer',
])

export interface ComponentParameter {
  '@odata.type': string
  [key: string]: unknown
}

export function normalizeOrgUrl(value: string): string {
  let url = value.trim()
  if (!url) throw new Error('Enter the environment URL, for example https://org.crm.dynamics.com')
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  url = url.replace(/\/+$/, '')
  const parsed = new URL(url)
  if (!parsed.hostname.includes('.')) {
    throw new Error('That does not look like a Dataverse environment URL.')
  }
  return `${parsed.protocol}//${parsed.host}`
}

function apiUrl(orgUrl: string, path: string): string {
  return `${orgUrl.replace(/\/+$/, '')}${API_PATH}${path}`
}

function requestHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
  }
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  if (!text) return `${response.status} ${response.statusText}`
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string; code?: string } }
    if (parsed.error?.message) {
      return parsed.error.code ? `${parsed.error.code}: ${parsed.error.message}` : parsed.error.message
    }
  } catch {
    // Fall through to the raw response body.
  }
  return text.length > 600 ? `${text.slice(0, 600)}…` : text
}

export async function listSolutions(
  orgUrl: string,
  accessToken: string,
): Promise<CloudSolution[]> {
  const query = new URLSearchParams({
    // `isparent` is not an attribute on the solution entity. A solution is a
    // patch when it has a parent; parent solutions have a null parent lookup.
    $select:
      'solutionid,uniquename,friendlyname,version,ismanaged,isvisible,_parentsolutionid_value',
    $orderby: 'friendlyname asc',
  })

  const collected: CloudSolution[] = []
  let next: string | undefined = apiUrl(orgUrl, `/solutions?${query.toString()}`)
  let page = 0

  while (next && page < 10) {
    const response: Response = await fetch(next, { headers: requestHeaders(accessToken) })
    if (!response.ok) {
      throw new Error(`Could not list solutions. ${await readError(response)}`)
    }
    const payload = (await response.json()) as {
      value?: Array<Record<string, unknown>>
      '@odata.nextLink'?: string
    }
    for (const raw of payload.value ?? []) {
      const uniqueName = typeof raw.uniquename === 'string' ? raw.uniquename : ''
      if (!uniqueName) continue
      if (SYSTEM_SOLUTIONS.has(uniqueName.toLowerCase())) continue
      if (raw.isvisible === false) continue
      // Skip patches and patches-of-patches; only parent solutions can be
      // exported and imported as a complete solution.
      if (typeof raw._parentsolutionid_value === 'string' && raw._parentsolutionid_value) continue
      const friendly = typeof raw.friendlyname === 'string' ? raw.friendlyname : ''
      collected.push({
        solutionId: typeof raw.solutionid === 'string' ? raw.solutionid : '',
        uniqueName,
        displayName: friendly || uniqueName,
        version: typeof raw.version === 'string' ? raw.version : '',
        managed: raw.ismanaged === true,
        isParent: !raw._parentsolutionid_value,
      })
    }
    next = payload['@odata.nextLink']
    page += 1
  }

  return collected.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export async function exportSolution(
  orgUrl: string,
  accessToken: string,
  uniqueName: string,
  managed: boolean,
): Promise<Blob> {
  const response = await fetch(apiUrl(orgUrl, '/ExportSolution'), {
    method: 'POST',
    headers: {
      ...requestHeaders(accessToken),
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ SolutionName: uniqueName, Managed: managed }),
  })

  if (!response.ok) {
    throw new Error(`Export failed. ${await readError(response)}`)
  }

  const payload = (await response.json()) as { ExportSolutionFile?: string }
  if (!payload.ExportSolutionFile) {
    throw new Error('Export succeeded but Dataverse returned no solution file.')
  }
  return base64ToBlob(payload.ExportSolutionFile)
}

/**
 * Connection references are not stored in the exported ZIP. Dataverse expects
 * them as `connectionreference` component parameters during import.
 */
export function buildComponentParameters(
  settings: DeploymentSettings,
): ComponentParameter[] {
  const parameters: ComponentParameter[] = []
  for (const reference of settings.ConnectionReferences) {
    const connectionId = reference.ConnectionId.trim()
    if (!connectionId || !reference.LogicalName) continue
    parameters.push({
      '@odata.type': 'Microsoft.Dynamics.CRM.connectionreference',
      connectionreferencelogicalname: reference.LogicalName,
      connectionid: connectionId,
      connectorid: reference.ConnectorId,
    })
  }
  return parameters
}

export async function startImport(
  orgUrl: string,
  accessToken: string,
  blob: Blob,
  options: ImportOptions,
  componentParameters: ComponentParameter[],
): Promise<ImportJobHandle> {
  const customizationFile = await blobToBase64(blob)
  const body: Record<string, unknown> = {
    CustomizationFile: customizationFile,
    OverwriteUnmanagedCustomizations: options.overwriteUnmanagedCustomizations,
    PublishWorkflows: options.publishWorkflows,
    SkipProductUpdateDependencies: options.skipProductUpdateDependencies,
    ImportJobId: crypto.randomUUID(),
  }
  if (options.bindConnections && componentParameters.length > 0) {
    body.ComponentParameters = componentParameters
  }

  const response = await fetch(apiUrl(orgUrl, '/ImportSolutionAsync'), {
    method: 'POST',
    headers: {
      ...requestHeaders(accessToken),
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Import request failed. ${await readError(response)}`)
  }

  const payload = (await response.json()) as {
    AsyncOperationId?: string
    ImportJobKey?: string
  }
  if (!payload.AsyncOperationId) {
    throw new Error('Dataverse accepted the import but returned no async operation ID.')
  }

  return {
    asyncOperationId: payload.AsyncOperationId.replace(/[{}]/g, ''),
    importJobKey: payload.ImportJobKey,
  }
}

interface AsyncOperation {
  statecode?: number
  statuscode?: number
  message?: string
  friendlymessage?: string
  progress?: number | string
}

function describeOperationMessage(operation: AsyncOperation): string {
  const raw = operation.friendlymessage || operation.message || ''
  if (!raw) return 'Dataverse did not return a message for this import.'
  try {
    const parsed = JSON.parse(raw) as { message?: string; errorCode?: string }
    if (parsed.message) {
      return parsed.errorCode ? `${parsed.errorCode}: ${parsed.message}` : parsed.message
    }
  } catch {
    // The message is usually plain text.
  }
  return raw
}

export async function waitForImport(
  orgUrl: string,
  accessToken: string,
  handle: ImportJobHandle,
  onProgress: (progress: ImportProgress) => void,
): Promise<ImportOutcome> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS))

    const response = await fetch(
      apiUrl(
        orgUrl,
        `/asyncoperations(${handle.asyncOperationId})?$select=statecode,statuscode,message,friendlymessage,progress`,
      ),
      { headers: requestHeaders(accessToken) },
    )

    if (!response.ok) {
      throw new Error(`Could not read the import status. ${await readError(response)}`)
    }

    const operation = (await response.json()) as AsyncOperation
    const rawProgress =
      typeof operation.progress === 'number'
        ? operation.progress
        : Number.parseFloat(String(operation.progress ?? ''))
    const percent = Number.isFinite(rawProgress)
      ? Math.max(0, Math.min(100, Math.round(rawProgress * 100)))
      : undefined

    onProgress({
      stage: 'processing',
      message:
        operation.statecode === 3
          ? 'Import finished. Reading the result…'
          : `Dataverse is importing the solution${percent !== undefined ? ` (${percent}%)` : ''}…`,
      percent,
      asyncOperationId: handle.asyncOperationId,
      importJobKey: handle.importJobKey,
    })

    if (operation.statecode === 3) {
      const succeeded = operation.statuscode === 30
      return {
        succeeded,
        message: succeeded
          ? 'Solution imported successfully.'
          : describeOperationMessage(operation),
        asyncOperationId: handle.asyncOperationId,
        importJobKey: handle.importJobKey,
      }
    }
  }

  throw new Error(
    'The import is still running after 20 minutes. Check the solution history in the Power Apps maker portal.',
  )
}

export async function retrieveImportLog(
  orgUrl: string,
  accessToken: string,
  importJobKey: string | undefined,
): Promise<string | undefined> {
  if (!importJobKey) return undefined
  const key = importJobKey.replace(/[{}]/g, '')
  const response = await fetch(
    apiUrl(orgUrl, `/importjobs(${key})?$select=data`),
    { headers: requestHeaders(accessToken) },
  )
  if (!response.ok) return undefined
  const payload = (await response.json()) as { data?: string }
  if (!payload.data || typeof DOMParser === 'undefined') return undefined

  try {
    const document = new DOMParser().parseFromString(payload.data, 'text/xml')
    const messages: string[] = []
    const result = document.querySelector('solutionManifest > result')
    const overall = result?.getAttribute('result')
    if (overall && overall !== 'success') {
      const text = result?.getAttribute('errortext')
      messages.push(text ? `Import result: ${overall} — ${text}` : `Import result: ${overall}`)
    }
    for (const node of Array.from(document.querySelectorAll('[errortext]'))) {
      const text = node.getAttribute('errortext')
      if (text && !messages.includes(text)) messages.push(text)
    }
    return messages.slice(0, 8).join('\n') || undefined
  } catch {
    return undefined
  }
}
