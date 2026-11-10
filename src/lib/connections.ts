import type { ConnectionReference, SolutionPackage } from '../types'
import { escapeRegExp } from './xml'

const CONNECTOR_LABELS: Record<string, string> = {
  shared_commondataserviceforapps: 'Microsoft Dataverse',
  shared_commondataservice: 'Microsoft Dataverse (legacy)',
  commondataservice: 'Microsoft Dataverse (classic)',
  shared_office365: 'Office 365 Outlook',
  shared_office365users: 'Office 365 Users',
  shared_office365groups: 'Office 365 Groups',
  shared_sharepointonline: 'SharePoint',
  shared_onedriveforbusiness: 'OneDrive for Business',
  shared_excelonlinebusiness: 'Excel Online (Business)',
  shared_teams: 'Microsoft Teams',
  shared_approvals: 'Approvals',
  shared_azuread: 'Microsoft Entra ID',
  shared_azureblob: 'Azure Blob Storage',
  shared_sql: 'SQL Server',
  shared_http: 'HTTP',
  shared_logicflows: 'Power Automate',
  shared_powerappsforappmakers: 'Power Apps for Makers',
  shared_flowmanagement: 'Power Automate Management',
  shared_dynamicscrmonline: 'Dynamics 365',
  shared_microsoftforms: 'Microsoft Forms',
  shared_planner: 'Planner',
  shared_todo: 'Microsoft To Do',
}

export interface ConnectorGroup {
  connectorId: string
  connectorKey: string
  connectorName: string
  references: ConnectionReference[]
}

export function connectorDisplayName(connectorId: string): string {
  const trimmed = connectorId.trim().replace(/\/+$/, '')
  if (!trimmed) return 'Unknown connector'
  const tail = (trimmed.split('/').pop() ?? trimmed).toLowerCase()
  const known = CONNECTOR_LABELS[tail]
  if (known) return known
  return tail
    .replace(/^shared_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-z]/g, (character) => character.toUpperCase())
}

export function connectorKey(connectorId: string): string {
  return connectorId.trim().replace(/\/+$/, '').toLowerCase()
}

/**
 * Groups references that target the same connector. References without a
 * connector id are left out: they are reported separately and never merged.
 */
export function groupConnectionReferences(
  references: ConnectionReference[],
): ConnectorGroup[] {
  const groups = new Map<string, ConnectionReference[]>()
  for (const reference of references) {
    const key = connectorKey(reference.connectorId)
    if (!key) continue
    const bucket = groups.get(key)
    if (bucket) bucket.push(reference)
    else groups.set(key, [reference])
  }
  return [...groups.entries()]
    .map(([key, items]) => ({
      connectorId: items[0]?.connectorId ?? '',
      connectorKey: key,
      connectorName: connectorDisplayName(items[0]?.connectorId ?? ''),
      references: [...items].sort((a, b) => a.logicalName.localeCompare(b.logicalName)),
    }))
    .sort(
      (a, b) =>
        b.references.length - a.references.length ||
        a.connectorName.localeCompare(b.connectorName),
    )
}

export interface FlowUsage {
  flows: Record<string, string[]>
  flowFileCount: number
  skippedFiles: number
  hasCanvasApps: boolean
}

/**
 * References that can safely be merged into the chosen survivor. Only
 * references that target the exact same connector qualify; connector ids are
 * normalized so trailing slashes and casing do not matter.
 */
export function connectionMergeCandidates(
  references: ConnectionReference[],
  survivorLogicalName: string,
): ConnectionReference[] {
  const survivor = references.find(
    (reference) => reference.logicalName === survivorLogicalName,
  )
  if (!survivor) return []
  const key = connectorKey(survivor.connectorId)
  if (!key) return []
  return references.filter(
    (reference) =>
      reference.logicalName !== survivor.logicalName &&
      connectorKey(reference.connectorId) === key,
  )
}

export function effectiveConnectionReferences(
  references: ConnectionReference[],
  merges: Record<string, string> | undefined,
): ConnectionReference[] {
  if (!merges) return references
  const removed = new Set(
    Object.entries(merges)
      .filter(([from, to]) => from && to && from !== to)
      .map(([from]) => from),
  )
  if (removed.size === 0) return references
  return references.filter((reference) => !removed.has(reference.logicalName))
}

/**
 * Rewrites every occurrence of a merged logical name inside a flow definition
 * with the surviving logical name. Flow exports use the name both as an object
 * key and inside `connectionReferenceLogicalName`, so a boundary-aware text
 * replacement covers every known shape.
 */
export function replaceConnectionReferenceNames(
  text: string,
  merges: Record<string, string>,
): { text: string; replacements: number } {
  const mapping = new Map<string, string>()
  for (const [merged, survivor] of Object.entries(merges)) {
    const from = merged.trim()
    const to = survivor.trim()
    if (!from || !to || from.toLowerCase() === to.toLowerCase()) continue
    mapping.set(from.toLowerCase(), to)
  }
  if (mapping.size === 0) return { text, replacements: 0 }

  const names = [...mapping.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
  const pattern = new RegExp(`\\b(?:${names.join('|')})\\b`, 'gi')
  let replacements = 0
  const next = text.replace(pattern, (match) => {
    const target = mapping.get(match.toLowerCase())
    if (!target) return match
    replacements += 1
    return target
  })
  return { text: next, replacements }
}

export interface TextEntry {
  path: string
  text: string
}

const MAX_WORKFLOW_BYTES = 8 * 1024 * 1024
const WORKFLOW_PATH = /(^|\/)workflows\//i

export function isWorkflowJson(path: string): boolean {
  return WORKFLOW_PATH.test(path) && /\.json$/i.test(path)
}

export function flowLabel(path: string): string {
  const base = (path.split('/').pop() ?? path).replace(/\.json$/i, '')
  return base.replace(/[-_]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '')
}

/**
 * Cloud flows reference connection references by logical name inside their
 * definition JSON. Scanning the raw text is deliberate: exports wrap that JSON
 * in different shapes (clientdata strings, properties, older schemas), and a
 * name match is stable across all of them.
 */
export function detectConnectionUsage(
  entries: TextEntry[],
  references: ConnectionReference[],
  options: { hasCanvasApps?: boolean; skippedFiles?: number } = {},
): FlowUsage {
  const flows: Record<string, string[]> = {}
  for (const reference of references) flows[reference.logicalName] = []

  let flowFileCount = 0
  for (const entry of entries) {
    if (!isWorkflowJson(entry.path)) continue
    flowFileCount += 1
    const label = flowLabel(entry.path)
    const haystack = entry.text.toLowerCase()
    for (const reference of references) {
      if (!reference.logicalName) continue
      if (!haystack.includes(reference.logicalName.toLowerCase())) continue
      const usedBy = flows[reference.logicalName]
      if (!usedBy || usedBy.includes(label)) continue
      usedBy.push(label)
    }
  }

  return {
    flows,
    flowFileCount,
    skippedFiles: options.skippedFiles ?? 0,
    hasCanvasApps: options.hasCanvasApps ?? false,
  }
}

export async function analyzeConnectionUsage(
  pkg: SolutionPackage,
): Promise<FlowUsage> {
  const paths = pkg.files.map((file) => file.path).filter(isWorkflowJson)
  const entries: TextEntry[] = []
  let skippedFiles = 0

  for (const path of paths) {
    const entry = pkg.zip.file(path)
    if (!entry) continue
    try {
      const bytes = await entry.async('uint8array')
      if (bytes.byteLength > MAX_WORKFLOW_BYTES) {
        skippedFiles += 1
        continue
      }
      entries.push({
        path,
        text: new TextDecoder('utf-8', { fatal: false }).decode(bytes),
      })
    } catch {
      skippedFiles += 1
    }
  }

  return detectConnectionUsage(entries, pkg.connectionReferences, {
    hasCanvasApps: pkg.hasCanvasApps,
    skippedFiles,
  })
}
