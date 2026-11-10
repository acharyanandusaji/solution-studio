import JSZip from 'jszip'
import {
  CUSTOMIZATIONS_XML,
  MAX_PREVIEW_BYTES,
  SOLUTION_XML,
  TEXT_EXTENSIONS,
} from './constants'
import type {
  ConnectionReference,
  DeploymentSettings,
  EnvironmentVariable,
  SolutionEdits,
  SolutionPackage,
  ZipFileInfo,
} from '../types'
import {
  effectiveConnectionReferences as filterConnectionReferences,
  isWorkflowJson,
  replaceConnectionReferenceNames,
} from './connections'
import {
  parseConnectionReferences,
  parseEnvironmentVariableDefinitionFile,
  parseEnvironmentVariables,
  parseEnvironmentVariableValueFile,
  parseSolutionXml,
  removeConnectionReferences,
  removeMissingDependencies,
  removeRootComponents,
  setEnvironmentVariableValue,
  setEnvironmentVariableValueFile,
  setManagedFlag,
  setSolutionVersion,
  validateXml,
} from './xml'

export class SolutionLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SolutionLoadError'
  }
}

function stripBom(xml: string): string {
  return xml.replace(/^\uFEFF/, '')
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

function findFile(zip: JSZip, fileName: string): string | undefined {
  const candidates = Object.keys(zip.files).filter(
    (path) => !zip.files[path].dir && basename(path).toLowerCase() === fileName.toLowerCase(),
  )
  candidates.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
  return candidates[0]
}

function detectFeature(files: string[], folder: string): boolean {
  return files.some((path) => path.toLowerCase().includes(folder.toLowerCase()))
}

export async function loadSolutionPackage(file: File): Promise<SolutionPackage> {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    throw new SolutionLoadError('Please upload a .zip file exported from Power Platform.')
  }
  if (file.size === 0) {
    throw new SolutionLoadError('The selected ZIP file is empty.')
  }

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file, { checkCRC32: false, createFolders: false })
  } catch (error) {
    throw new SolutionLoadError(
      `The ZIP archive could not be read. It may be corrupt. ${(error as Error).message}`,
    )
  }

  const allPaths = Object.keys(zip.files).filter((path) => !zip.files[path].dir)
  if (allPaths.length === 0) {
    throw new SolutionLoadError('The ZIP archive does not contain any files.')
  }

  const solutionPath = findFile(zip, SOLUTION_XML)
  if (!solutionPath) {
    throw new SolutionLoadError(
      'This does not look like a Power Platform solution. solution.xml was not found in the ZIP.',
    )
  }

  const solutionXml = stripBom(await zip.file(solutionPath)!.async('string'))
  const xmlValidation = validateXml(solutionXml)
  if (!xmlValidation.valid) {
    throw new SolutionLoadError(`solution.xml is not valid XML. ${xmlValidation.error}`)
  }

  let solution
  try {
    solution = parseSolutionXml(solutionXml)
  } catch (error) {
    throw new SolutionLoadError(`solution.xml could not be parsed. ${(error as Error).message}`)
  }

  const customizationsPath = findFile(zip, CUSTOMIZATIONS_XML)
  let customizationsXml = ''
  if (customizationsPath) {
    customizationsXml = stripBom(await zip.file(customizationsPath)!.async('string'))
    const customizationsValidation = validateXml(customizationsXml)
    if (!customizationsValidation.valid) {
      throw new SolutionLoadError(
        `customizations.xml is not valid XML. ${customizationsValidation.error}`,
      )
    }
  }

  let environmentVariables: EnvironmentVariable[] = []
  let connectionReferences: ConnectionReference[] = []
  if (customizationsXml) {
    try {
      environmentVariables = parseEnvironmentVariables(customizationsXml)
      connectionReferences = parseConnectionReferences(customizationsXml)
    } catch (error) {
      throw new SolutionLoadError(
        `customizations.xml could not be inspected. ${(error as Error).message}`,
      )
    }
  }

  const environmentVariableValuePaths: Record<string, string> = {}
  const envFolderPath =
    /^(?:.*\/)?environmentvariabledefinitions\/([^/]+)\/(environmentvariabledefinition\.xml|environmentvariablevalues\.json)$/i
  const definitionFiles = allPaths.filter((path) => {
    const match = envFolderPath.exec(path)
    return match?.[2]?.toLowerCase() === 'environmentvariabledefinition.xml'
  })
  const valueFiles = allPaths.filter((path) => {
    const match = envFolderPath.exec(path)
    return match?.[2]?.toLowerCase() === 'environmentvariablevalues.json'
  })

  const variablesBySchema = new Map(
    environmentVariables.map((variable) => [variable.schemaName.toLowerCase(), variable]),
  )

  for (const path of definitionFiles) {
    const folder = envFolderPath.exec(path)?.[1]
    if (!folder || variablesBySchema.has(folder.toLowerCase())) continue
    try {
      const xml = stripBom(await zip.file(path)!.async('string'))
      const variable = parseEnvironmentVariableDefinitionFile(xml)
      if (!variable) continue
      const variableFolder = variable.schemaName.toLowerCase()
      if (variablesBySchema.has(variableFolder)) continue
      variablesBySchema.set(variableFolder, variable)
      environmentVariables.push(variable)
    } catch {
      // A malformed sidecar definition should not block the whole package.
    }
  }

  for (const path of valueFiles) {
    const folder = envFolderPath.exec(path)?.[1]
    if (!folder) continue
    const variable = variablesBySchema.get(folder.toLowerCase())
    if (!variable) continue
    try {
      const text = stripBom(await zip.file(path)!.async('string'))
      const stored = parseEnvironmentVariableValueFile(text)
      environmentVariableValuePaths[variable.schemaName] = path
      if (stored.hasValue) {
        variable.currentValue = stored.value
        variable.explicitValue = true
      }
    } catch {
      // Keep the default value when the sidecar cannot be read.
    }
  }

  const files: ZipFileInfo[] = allPaths
    .map((path) => {
      const entry = zip.files[path]
      const extension = basename(path).includes('.')
        ? basename(path).split('.').pop()?.toLowerCase() ?? ''
        : ''
      return {
        path,
        size: 0,
        compressedSize: 0,
        isDirectory: false,
        date: entry.date ? entry.date.toISOString() : null,
        extension,
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path))

  const fileSizes = new Map<string, number>()
  await Promise.all(
    allPaths.map(async (path) => {
      try {
        const bytes = await zip.file(path)!.async('uint8array')
        fileSizes.set(path, bytes.byteLength)
      } catch {
        fileSizes.set(path, 0)
      }
    }),
  )
  for (const item of files) item.size = fileSizes.get(item.path) ?? 0

  const hasWebResources = detectFeature(allPaths, 'WebResources/')
  const hasPluginAssemblies =
    detectFeature(allPaths, 'PluginAssemblies/') ||
    solution.rootComponents.some((component) => component.type === 90)
  const hasFlows = solution.rootComponents.some(
    (component) => component.type === 29 || component.type === 10039 || component.type === 10310,
  )
  const hasCanvasApps =
    detectFeature(allPaths, 'CanvasApps/') ||
    solution.rootComponents.some((component) => component.type === 10036)

  return {
    fileName: file.name,
    fileSize: file.size,
    sourceFile: file,
    zip,
    solutionXml,
    solutionPath,
    customizationsXml,
    customizationsPath: customizationsPath ?? '',
    solution,
    environmentVariables,
    environmentVariableValuePaths,
    connectionReferences,
    files,
    loadedAt: new Date().toISOString(),
    hasWebResources,
    hasPluginAssemblies,
    hasFlows,
    hasCanvasApps,
  }
}

export function initialEdits(pkg: SolutionPackage): SolutionEdits {
  return {
    version: pkg.solution.version,
    managed: pkg.solution.managed,
    removeMissingDependencies: false,
    envVarValues: {},
    connectionIds: Object.fromEntries(
      pkg.connectionReferences.map((reference) => [
        reference.logicalName,
        reference.connectionId,
      ]),
    ),
    connectionMerges: {},
  }
}

export function effectiveEnvironmentValue(
  pkg: SolutionPackage,
  edits: SolutionEdits,
  schemaName: string,
): string {
  if (Object.prototype.hasOwnProperty.call(edits.envVarValues, schemaName)) {
    return edits.envVarValues[schemaName]
  }
  return (
    pkg.environmentVariables.find((variable) => variable.schemaName === schemaName)
      ?.currentValue ?? ''
  )
}

export function effectiveConnectionId(
  edits: SolutionEdits,
  logicalName: string,
): string {
  return edits.connectionIds[logicalName] ?? ''
}

/**
 * Connection references that remain after structural merges. Merged-away
 * references are removed from the ZIP and from deployment settings.
 */
export function effectiveConnectionReferences(
  pkg: SolutionPackage,
  edits: SolutionEdits,
): ConnectionReference[] {
  return filterConnectionReferences(pkg.connectionReferences, edits.connectionMerges)
}

export function generateDeploymentSettings(
  pkg: SolutionPackage,
  edits: SolutionEdits,
): DeploymentSettings {
  return {
    EnvironmentVariables: pkg.environmentVariables.map((variable) => ({
      SchemaName: variable.schemaName,
      Value: effectiveEnvironmentValue(pkg, edits, variable.schemaName),
    })),
    ConnectionReferences: effectiveConnectionReferences(pkg, edits).map((reference) => ({
      LogicalName: reference.logicalName,
      ConnectionId: effectiveConnectionId(edits, reference.logicalName),
      ConnectorId: reference.connectorId,
    })),
  }
}

export interface BuildResult {
  blob: Blob
  fileName: string
  size: number
  solutionXml: string
  customizationsXml: string
  appliedEnvironmentVariables: number
  mergedConnectionReferences: number
  rewrittenFlowFiles: number
}

export function outputFileName(pkg: SolutionPackage, edits: SolutionEdits): string {
  const safeName = pkg.solution.uniqueName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const suffix = edits.managed ? 'managed' : 'unmanaged'
  return `${safeName}_${edits.version}_${suffix}.zip`
}

export async function buildEditedPackage(
  pkg: SolutionPackage,
  edits: SolutionEdits,
): Promise<BuildResult> {
  // Flatten merge chains so every merged name resolves to the final survivor.
  const referencesByName = new Map(
    pkg.connectionReferences.map((reference) => [reference.logicalName, reference]),
  )
  const rawMerges = edits.connectionMerges ?? {}
  const resolveTarget = (logicalName: string): string => {
    let current = logicalName
    const seen = new Set<string>()
    while (rawMerges[current] && !seen.has(current)) {
      seen.add(current)
      current = rawMerges[current]
    }
    return current
  }
  const connectionMerges: Record<string, string> = {}
  for (const from of Object.keys(rawMerges)) {
    const target = resolveTarget(from)
    if (from === target) continue
    if (!referencesByName.has(from) || !referencesByName.has(target)) continue
    connectionMerges[from] = target
  }
  const mergedReferences = pkg.connectionReferences.filter(
    (reference) => connectionMerges[reference.logicalName],
  )
  const mergedNames = mergedReferences.map((reference) => reference.logicalName)

  let solutionXml = edits.solutionXmlOverride ?? pkg.solutionXml
  solutionXml = setSolutionVersion(solutionXml, edits.version)
  solutionXml = setManagedFlag(solutionXml, edits.managed)
  if (edits.removeMissingDependencies) {
    solutionXml = removeMissingDependencies(solutionXml)
  }
  if (mergedReferences.length > 0) {
    solutionXml = removeRootComponents(solutionXml, {
      type: 372,
      ids: mergedReferences.map((reference) => reference.id ?? '').filter(Boolean),
      schemaNames: mergedNames,
    })
  }

  const solutionValidation = validateXml(solutionXml)
  if (!solutionValidation.valid) {
    throw new Error(`The edited solution.xml is not valid XML. ${solutionValidation.error}`)
  }

  let customizationsXml = edits.customizationsXmlOverride ?? pkg.customizationsXml
  let customizationsChanged = false
  let appliedEnvironmentVariables = 0

  if (mergedNames.length > 0 && customizationsXml) {
    customizationsXml = removeConnectionReferences(customizationsXml, mergedNames)
    customizationsChanged = true
  }

  const definitionPathPattern =
    /^(?:.*\/)?environmentvariabledefinitions\/([^/]+)\/environmentvariabledefinition\.xml$/i
  const definitionPaths = new Map<string, string>()
  for (const path of Object.keys(pkg.zip.files)) {
    const match = definitionPathPattern.exec(path)
    if (match) definitionPaths.set(match[1].toLowerCase(), path)
  }

  // Modern exports store values in environmentvariablevalues.json next to the
  // definition. Prefer that file, and only fall back to customizations.xml when
  // the variable has no sidecar definition folder.
  const valueFileOverrides = new Map<string, string>()
  for (const [schemaName, value] of Object.entries(edits.envVarValues)) {
    const definition = pkg.environmentVariables.find(
      (variable) => variable.schemaName === schemaName,
    )
    if (!definition) continue

    const definitionPath = definitionPaths.get(schemaName.toLowerCase())
    const folderPath = definitionPath
      ? definitionPath.replace(/[^/]+$/i, '')
      : ''
    const valuePath =
      pkg.environmentVariableValuePaths[schemaName] ||
      (folderPath ? `${folderPath}environmentvariablevalues.json` : '')

    if (valuePath) {
      let existing = ''
      const entry = pkg.zip.file(valuePath)
      if (entry) {
        try {
          existing = stripBom(await entry.async('string'))
        } catch {
          existing = ''
        }
      }
      valueFileOverrides.set(valuePath, setEnvironmentVariableValueFile(existing, value))
      appliedEnvironmentVariables += 1
      continue
    }

    if (customizationsXml) {
      customizationsXml = setEnvironmentVariableValue(customizationsXml, schemaName, value)
      customizationsChanged = true
      appliedEnvironmentVariables += 1
    }
  }

  if (customizationsChanged) {
    const customizationsValidation = validateXml(customizationsXml)
    if (!customizationsValidation.valid) {
      throw new Error(
        `The edited customizations.xml is not valid XML. ${customizationsValidation.error}`,
      )
    }
  }

  const output = new JSZip()
  let rewrittenFlowFiles = 0
  const paths = Object.keys(pkg.zip.files).sort()
  for (const path of paths) {
    const entry = pkg.zip.files[path]
    if (entry.dir) {
      output.file(path, null, {
        dir: true,
        date: entry.date,
        unixPermissions: entry.unixPermissions,
        dosPermissions: entry.dosPermissions,
        comment: entry.comment,
      })
      continue
    }

    if (path === pkg.solutionPath) {
      output.file(path, solutionXml, {
        date: entry.date,
        unixPermissions: entry.unixPermissions,
        dosPermissions: entry.dosPermissions,
        comment: entry.comment,
        compression: 'DEFLATE',
      })
    } else if (path === pkg.customizationsPath && customizationsXml) {
      output.file(path, customizationsXml, {
        date: entry.date,
        unixPermissions: entry.unixPermissions,
        dosPermissions: entry.dosPermissions,
        comment: entry.comment,
        compression: 'DEFLATE',
      })
    } else if (valueFileOverrides.has(path)) {
      output.file(path, valueFileOverrides.get(path)!, {
        date: entry.date,
        unixPermissions: entry.unixPermissions,
        dosPermissions: entry.dosPermissions,
        comment: entry.comment,
        compression: 'DEFLATE',
      })
    } else if (mergedNames.length > 0 && isWorkflowJson(path)) {
      const text = stripBom(await entry.async('string'))
      const rewritten = replaceConnectionReferenceNames(text, connectionMerges)
      if (rewritten.replacements > 0) {
        rewrittenFlowFiles += 1
        output.file(path, rewritten.text, {
          date: entry.date,
          unixPermissions: entry.unixPermissions,
          dosPermissions: entry.dosPermissions,
          comment: entry.comment,
          compression: 'DEFLATE',
        })
      } else {
        const data = await entry.async('uint8array')
        output.file(path, data, {
          date: entry.date,
          unixPermissions: entry.unixPermissions,
          dosPermissions: entry.dosPermissions,
          comment: entry.comment,
          compression: entry.options?.compression ?? 'DEFLATE',
          binary: true,
        })
      }
    } else {
      const data = await entry.async('uint8array')
      output.file(path, data, {
        date: entry.date,
        unixPermissions: entry.unixPermissions,
        dosPermissions: entry.dosPermissions,
        comment: entry.comment,
        compression: entry.options?.compression ?? 'DEFLATE',
        binary: true,
      })
    }
  }

  for (const [path, text] of valueFileOverrides) {
    if (!pkg.zip.files[path]) {
      output.file(path, text, { compression: 'DEFLATE' })
    }
  }

  const blob = await output.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'DOS',
  })

  return {
    blob,
    fileName: outputFileName(pkg, edits),
    size: blob.size,
    solutionXml,
    customizationsXml,
    appliedEnvironmentVariables,
    mergedConnectionReferences: mergedReferences.length,
    rewrittenFlowFiles,
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 15_000)
}

export function downloadText(text: string, fileName: string, mime = 'text/plain'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), fileName)
}

export async function previewZipEntry(
  pkg: SolutionPackage,
  path: string,
): Promise<{ text: string; binary: boolean; truncated: boolean; size: number }> {
  const entry = pkg.zip.file(path)
  if (!entry) throw new Error('That file is no longer available in the ZIP.')
  const bytes = await entry.async('uint8array')
  const slice = bytes.subarray(0, MAX_PREVIEW_BYTES)
  const binary = slice.includes(0)
  const text = new TextDecoder('utf-8', { fatal: false }).decode(slice)
  return {
    text,
    binary,
    truncated: bytes.byteLength > MAX_PREVIEW_BYTES,
    size: bytes.byteLength,
  }
}

export function isPreviewable(file: ZipFileInfo): boolean {
  return TEXT_EXTENSIONS.has(file.extension) || file.path.toLowerCase().endsWith('.xml')
}

export async function verifyZipIntegrity(
  pkg: SolutionPackage,
): Promise<{ valid: boolean; entries: number; error?: string }> {
  try {
    const zip = await JSZip.loadAsync(await pkg.sourceFile.arrayBuffer(), {
      checkCRC32: true,
      createFolders: false,
    })
    const entries = Object.values(zip.files).filter((entry) => !entry.dir).length
    return { valid: true, entries }
  } catch (error) {
    return { valid: false, entries: 0, error: (error as Error).message }
  }
}

export function xmlSnippet(xml: string, maxLength = 6000): string {
  if (xml.length <= maxLength) return xml
  return `${xml.slice(0, maxLength)}\n\n... truncated for display ...`
}
