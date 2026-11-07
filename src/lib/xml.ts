import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { COMPONENT_TYPES, ENV_VAR_TYPES, VERSION_PART_MAX } from './constants'
import type {
  ConnectionReference,
  DependencyItem,
  EnvironmentVariable,
  MissingDependency,
  PublisherInfo,
  RootComponent,
  SolutionInfo,
} from '../types'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  allowBooleanAttributes: true,
  cdataPropName: '#cdata',
  ignoreDeclaration: true,
  ignorePiTags: true,
  processEntities: true,
})

export function parseXml(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>
}

export function validateXml(xml: string): { valid: boolean; error?: string } {
  try {
    const result = XMLValidator.validate(xml, { allowBooleanAttributes: true })
    if (result === true) return { valid: true }
    return {
      valid: false,
      error: `Line ${result.err.line}, column ${result.err.col}: ${result.err.msg}`,
    }
  } catch (error) {
    return { valid: false, error: (error as Error).message }
  }
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

export function child(node: unknown, name: string): unknown {
  if (!node || typeof node !== 'object') return undefined
  const record = node as Record<string, unknown>
  const exact = record[name]
  if (exact !== undefined) return exact
  const key = Object.keys(record).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? record[key] : undefined
}

export function attr(node: unknown, name: string): string | undefined {
  if (!node || typeof node !== 'object') return undefined
  const record = node as Record<string, unknown>
  const exact = record[`@_${name}`]
  if (exact !== undefined) return String(exact)
  const key = Object.keys(record).find(
    (k) => k.toLowerCase() === `@_${name}`.toLowerCase(),
  )
  return key ? String(record[key]) : undefined
}

export function textOf(node: unknown): string {
  if (node === undefined || node === null) return ''
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return String(node)
  }
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object') {
    const record = node as Record<string, unknown>
    if (record['#text'] !== undefined) return textOf(record['#text'])
    if (record['#cdata'] !== undefined) return textOf(record['#cdata'])
    if (record['@_default'] !== undefined) return textOf(record['@_default'])
    const keys = Object.keys(record).filter(
      (k) => !k.startsWith('@_') && !k.startsWith('#') && k !== '?xml',
    )
    if (keys.length === 1) return textOf(record[keys[0]])
    return ''
  }
  return ''
}

export function displayValue(node: unknown): string {
  if (node === undefined || node === null) return ''
  if (typeof node === 'object' && !Array.isArray(node)) {
    const record = node as Record<string, unknown>
    const def = record['@_default']
    if (def !== undefined) return textOf(def)
    const text = record['#text']
    if (text !== undefined) return textOf(text)
    const labels = asArray(child(node, 'label'))
    if (labels.length > 0) {
      const preferred =
        labels.find((label) => attr(label, 'languagecode') === '1033') ?? labels[0]
      const description = attr(preferred, 'description')
      if (description) return description
    }
  }
  return textOf(node)
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function componentTypeName(type: number | undefined): string {
  if (type === undefined || Number.isNaN(type)) return 'Component'
  return COMPONENT_TYPES[type] ?? `Component ${type}`
}

export function envVarTypeName(type: number): string {
  return ENV_VAR_TYPES[type] ?? `Type ${type}`
}

function normalizedRoot(xml: string): Record<string, unknown> {
  const parsed = parseXml(xml)
  const root =
    child(parsed, 'ImportExportXml') ??
    child(parsed, 'importexportxml') ??
    parsed
  if (!root || typeof root !== 'object') {
    throw new Error('The XML does not contain an ImportExportXml root element.')
  }
  return root as Record<string, unknown>
}

function localizedName(names: unknown): { displayName: string; languageCode: string } {
  const list = asArray(child(names, 'LocalizedName') ?? child(names, 'Localizedname'))
  if (list.length === 0) return { displayName: '', languageCode: '1033' }
  const preferred =
    list.find((item) => attr(item, 'languagecode') === '1033') ?? list[0]
  return {
    displayName: attr(preferred, 'description') ?? textOf(preferred),
    languageCode: attr(preferred, 'languagecode') ?? '1033',
  }
}

export function parseSolutionXml(xml: string): SolutionInfo {
  const root = normalizedRoot(xml)
  const manifest = child(root, 'SolutionManifest')
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('solution.xml is missing the SolutionManifest element.')
  }

  const localized = localizedName(child(manifest, 'LocalizedNames'))
  const publisherNode = child(manifest, 'Publisher')
  const publisherLocalized = localizedName(child(publisherNode, 'LocalizedNames'))

  const publisher: PublisherInfo = {
    uniqueName: textOf(child(publisherNode, 'UniqueName')) || 'Unknown publisher',
    displayName:
      publisherLocalized.displayName ||
      textOf(child(publisherNode, 'FriendlyName')) ||
      textOf(child(publisherNode, 'UniqueName')) ||
      'Unknown publisher',
    prefix: textOf(child(publisherNode, 'CustomizationPrefix')),
    optionValuePrefix: textOf(child(publisherNode, 'CustomizationOptionValuePrefix')),
    email: textOf(child(publisherNode, 'EMailAddress')) || undefined,
    website: textOf(child(publisherNode, 'SupportingWebsiteUrl')) || undefined,
  }

  const descriptionNode = asArray(child(child(manifest, 'Descriptions'), 'LocalizedDescription'))
  const preferredDescription =
    descriptionNode.find((item) => attr(item, 'languagecode') === '1033') ?? descriptionNode[0]
  const description = preferredDescription
    ? attr(preferredDescription, 'description') ?? textOf(preferredDescription)
    : ''

  const uniqueName = textOf(child(manifest, 'UniqueName'))
  if (!uniqueName) {
    throw new Error('solution.xml is missing the solution UniqueName.')
  }

  const versionRaw = textOf(child(manifest, 'Version'))
  const managedRaw = textOf(child(manifest, 'Managed'))
  const managed = /^(1|true)$/i.test(managedRaw.trim())

  const rootComponents = asArray(child(manifest, 'RootComponents')).flatMap((group) =>
    asArray(child(group, 'RootComponent')).map((item): RootComponent => {
      const rawType = Number(attr(item, 'type') ?? 0)
      return {
        type: Number.isNaN(rawType) ? 0 : rawType,
        typeName: componentTypeName(Number.isNaN(rawType) ? undefined : rawType),
        id: attr(item, 'id'),
        schemaName: attr(item, 'schemaName') ?? attr(item, 'schemaname'),
        behavior: attr(item, 'behavior'),
        parentId: attr(item, 'parentId') ?? attr(item, 'parentid'),
      }
    }),
  )

  const missingContainer = child(manifest, 'MissingDependencies')
  const hasMissingDependenciesNode = missingContainer !== undefined
  const missingDependencies = asArray(child(missingContainer, 'MissingDependency')).map(
    (item, index): MissingDependency => {
      const requiredNode = child(item, 'Required')
      const dependencyNode = child(item, 'Dependency')
      const readDependency = (node: unknown): DependencyItem => {
        const rawType = Number(attr(node, 'type') ?? 0)
        const type = Number.isNaN(rawType) ? undefined : rawType
        return {
          type,
          typeName: componentTypeName(type),
          schemaName: attr(node, 'schemaName') ?? attr(node, 'schemaname'),
          displayName: attr(node, 'displayName') ?? attr(node, 'displayname'),
          parentSchemaName:
            attr(node, 'parentSchemaName') ?? attr(node, 'parentschemaname'),
          parentDisplayName:
            attr(node, 'parentDisplayName') ?? attr(node, 'parentdisplayname'),
          id: attr(node, 'id'),
        }
      }
      return {
        id: attr(item, 'id') ?? `missing-${index}`,
        required: readDependency(requiredNode),
        dependency: readDependency(dependencyNode),
      }
    },
  )

  const missingMatch = xml.match(
    /<MissingDependencies\b[^>]*>[\s\S]*?<\/MissingDependencies>/i,
  ) ?? xml.match(/<MissingDependencies\b[^>]*\/>/i)

  return {
    uniqueName,
    displayName: localized.displayName || uniqueName,
    description: description || undefined,
    version: versionRaw,
    versionRaw,
    managed,
    managedRaw: managedRaw || '0',
    publisher,
    languageCode: localized.languageCode,
    rootComponents,
    missingDependencies,
    hasMissingDependenciesNode,
    missingDependenciesXml: missingMatch?.[0] ?? '',
  }
}

function mapEnvironmentVariableDefinition(definition: unknown): EnvironmentVariable | null {
  const schemaName =
    attr(definition, 'schemaname') ??
    attr(definition, 'schemaName') ??
    textOf(child(definition, 'schemaname'))
  if (!schemaName) return null
  const rawType = Number(textOf(child(definition, 'type')) || 0)
  const type = Number.isNaN(rawType) ? 0 : rawType
  const defaultValue = textOf(child(definition, 'defaultvalue'))
  return {
    schemaName,
    displayName: displayValue(child(definition, 'displayname')) || schemaName,
    description: displayValue(child(definition, 'description')) || undefined,
    type,
    typeName: envVarTypeName(type),
    defaultValue,
    currentValue: defaultValue,
    explicitValue: false,
    secret: type === 100000005,
  }
}

function readEnvironmentVariableValues(
  root: Record<string, unknown>,
  valueMap: Map<string, string>,
): void {
  const valueEntries = asArray(
    child(child(root, 'environmentvariablevalues'), 'environmentvariablevalue'),
  )
  for (const entry of valueEntries) {
    const schemaName =
      attr(entry, 'schemaname') ??
      attr(entry, 'schemaName') ??
      textOf(child(entry, 'schemaname'))
    if (!schemaName) continue
    valueMap.set(schemaName.toLowerCase(), textOf(child(entry, 'value')))
  }
}

export function parseEnvironmentVariables(xml: string | undefined): EnvironmentVariable[] {
  if (!xml) return []
  const root = normalizedRoot(xml)
  const definitions = asArray(
    child(child(root, 'environmentvariabledefinitions'), 'environmentvariabledefinition'),
  )
  if (definitions.length === 0) return []

  const valueMap = new Map<string, string>()
  readEnvironmentVariableValues(root, valueMap)

  return definitions
    .map((definition) => {
      const variable = mapEnvironmentVariableDefinition(definition)
      if (!variable) return null
      const hasValue = valueMap.has(variable.schemaName.toLowerCase())
      if (hasValue) {
        variable.currentValue = valueMap.get(variable.schemaName.toLowerCase()) ?? ''
        variable.explicitValue = true
      }
      return variable
    })
    .filter((item): item is EnvironmentVariable => item !== null)
}

/**
 * Environment variable definitions can live in their own
 * `environmentvariabledefinitions/<name>/environmentvariabledefinition.xml`
 * file instead of customizations.xml. The root element may be the definition
 * itself or the `environmentvariabledefinitions` container.
 */
export function parseEnvironmentVariableDefinitionFile(
  xml: string,
): EnvironmentVariable | null {
  if (!xml.trim()) return null
  const parsed = parseXml(xml)
  const root = child(parsed, 'ImportExportXml') ?? parsed
  const node =
    child(root, 'environmentvariabledefinition') ??
    child(child(root, 'environmentvariabledefinitions'), 'environmentvariabledefinition') ??
    root
  return mapEnvironmentVariableDefinition(node)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function findJsonKey(record: Record<string, unknown>, name: string): string | undefined {
  return Object.keys(record).find((key) => key.toLowerCase() === name.toLowerCase())
}

function stringifyEnvironmentValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export interface EnvironmentVariableValueFile {
  hasValue: boolean
  value: string
}

/**
 * Reads `environmentvariablevalues.json` from a modern solution export:
 * `{ "environmentvariablevalues": { "environmentvariablevalue": { "value": "..." } } }`
 * Older exports may omit the value or the record id entirely.
 */
export function parseEnvironmentVariableValueFile(
  text: string,
): EnvironmentVariableValueFile {
  try {
    const parsed = asRecord(JSON.parse(text))
    if (!parsed) return { hasValue: false, value: '' }
    const container =
      asRecord(child(parsed, 'environmentvariablevalues')) ?? parsed
    const record =
      asRecord(child(container, 'environmentvariablevalue')) ?? container
    const valueKey = findJsonKey(record, 'value')
    if (!valueKey) return { hasValue: false, value: '' }
    return { hasValue: true, value: stringifyEnvironmentValue(record[valueKey]) }
  } catch {
    return { hasValue: false, value: '' }
  }
}

export function setEnvironmentVariableValueFile(text: string, value: string): string {
  let parsed: Record<string, unknown>
  try {
    parsed = asRecord(JSON.parse(text)) ?? {}
  } catch {
    parsed = {}
  }

  let container = asRecord(child(parsed, 'environmentvariablevalues'))
  if (!container) {
    container = {}
    const containerKey = findJsonKey(parsed, 'environmentvariablevalues') ?? 'environmentvariablevalues'
    parsed[containerKey] = container
  }

  let record = asRecord(child(container, 'environmentvariablevalue'))
  if (!record) {
    record = {}
    const recordKey =
      findJsonKey(container, 'environmentvariablevalue') ?? 'environmentvariablevalue'
    container[recordKey] = record
  }

  const valueKey = findJsonKey(record, 'value') ?? 'value'
  record[valueKey] = value
  return `${JSON.stringify(parsed, null, 2)}\n`
}

export function parseConnectionReferences(xml: string | undefined): ConnectionReference[] {
  if (!xml) return []
  const root = normalizedRoot(xml)
  const references = asArray(
    child(child(root, 'connectionreferences'), 'connectionreference'),
  )
  return references.map((reference) => ({
    logicalName:
      attr(reference, 'connectionreferencelogicalname') ??
      attr(reference, 'connectionReferenceLogicalName') ??
      textOf(child(reference, 'connectionreferencelogicalname')) ??
      '',
    displayName:
      textOf(child(reference, 'connectionreferencedisplayname')) ||
      attr(reference, 'connectionreferencedisplayname') ||
      attr(reference, 'connectionreferencelogicalname') ||
      'Connection reference',
    connectorId:
      textOf(child(reference, 'connectorid')) ||
      attr(reference, 'connectorid') ||
      '',
    connectionId: textOf(child(reference, 'connectionid')),
    description: displayValue(child(reference, 'description')) || undefined,
  }))
}

export function setSolutionVersion(xml: string, version: string): string {
  const versionPattern = /<Version\b[^>]*>[\s\S]*?<\/Version>/i
  if (!versionPattern.test(xml)) {
    throw new Error('Could not find a <Version> element in solution.xml.')
  }
  return xml.replace(versionPattern, `<Version>${escapeXml(version.trim())}</Version>`)
}

export function setManagedFlag(xml: string, managed: boolean): string {
  const value = managed ? '1' : '0'
  const managedPattern = /<Managed\b[^>]*>[\s\S]*?<\/Managed>/i
  if (managedPattern.test(xml)) {
    return xml.replace(managedPattern, `<Managed>${value}</Managed>`)
  }
  const selfClosing = /<Managed\b[^>]*\/>/i
  if (selfClosing.test(xml)) {
    return xml.replace(selfClosing, `<Managed>${value}</Managed>`)
  }
  if (/<\/SolutionManifest>/i.test(xml)) {
    return xml.replace(
      /(<\/SolutionManifest>)/i,
      `  <Managed>${value}</Managed>\n  $1`,
    )
  }
  throw new Error('Could not find the SolutionManifest to add the Managed flag.')
}

export function removeMissingDependencies(xml: string): string {
  return xml
    .replace(/[ \t]*<MissingDependencies\b[^>]*>[\s\S]*?<\/MissingDependencies>[ \t]*\r?\n?/i, '')
    .replace(/[ \t]*<MissingDependencies\b[^>]*\/>[ \t]*\r?\n?/i, '')
}

export function setEnvironmentVariableValue(
  xml: string,
  schemaName: string,
  value: string,
): string {
  const escapedName = escapeRegExp(schemaName)
  const attributePattern = new RegExp(
    `<environmentvariablevalue\\b(?=[^>]*\\bschemaname\\s*=\\s*["']${escapedName}["'])[^>]*>[\\s\\S]*?<\\/environmentvariablevalue>`,
    'i',
  )
  const escapedValue = escapeXml(value)

  if (attributePattern.test(xml)) {
    return xml.replace(attributePattern, (block) => {
      if (/<value\b[^>]*>[\s\S]*?<\/value>/i.test(block)) {
        return block.replace(/<value\b[^>]*>[\s\S]*?<\/value>/i, `<value>${escapedValue}</value>`)
      }
      if (/<value\b[^>]*\/>/i.test(block)) {
        return block.replace(/<value\b[^>]*\/>/i, `<value>${escapedValue}</value>`)
      }
      return block.replace(
        /<\/environmentvariablevalue>/i,
        `  <value>${escapedValue}</value>\n    </environmentvariablevalue>`,
      )
    })
  }

  const newEntry = `    <environmentvariablevalue schemaname="${escapeXml(
    schemaName,
  )}">\n      <value>${escapedValue}</value>\n    </environmentvariablevalue>`
  const containerPattern = /<environmentvariablevalues\b[^>]*>([\s\S]*?)<\/environmentvariablevalues>/i
  if (containerPattern.test(xml)) {
    return xml.replace(containerPattern, (block) =>
      block.replace(/<\/environmentvariablevalues>/i, `${newEntry}\n  </environmentvariablevalues>`),
    )
  }

  if (/<\/ImportExportXml>/i.test(xml)) {
    return xml.replace(
      /<\/ImportExportXml>/i,
      `  <environmentvariablevalues>\n${newEntry}\n  </environmentvariablevalues>\n</ImportExportXml>`,
    )
  }
  throw new Error('Could not find the ImportExportXml root to add the environment variable value.')
}

export function isValidVersion(version: string): boolean {
  const parts = version.trim().split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false
    const value = Number(part)
    return Number.isSafeInteger(value) && value >= 0 && value <= VERSION_PART_MAX
  })
}

export function bumpVersion(version: string, index: 0 | 1 | 2 | 3): string {
  const parts = version.trim().split('.').map((part) => Number(part) || 0)
  while (parts.length < 4) parts.push(0)
  parts[index] = Math.min(parts[index] + 1, VERSION_PART_MAX)
  for (let i = index + 1; i < 4; i += 1) parts[i] = 0
  return parts.join('.')
}

export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => Number(part) || 0)
  const right = b.split('.').map((part) => Number(part) || 0)
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0)
    if (delta !== 0) return delta
  }
  return 0
}

export function findNodeText(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml)
  return match ? textOf(parseXml(`<root>${match[1]}</root>`).root) : ''
}
