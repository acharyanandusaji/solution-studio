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
  parseConnectionReferences,
  parseEnvironmentVariables,
  parseSolutionXml,
  removeMissingDependencies,
  setEnvironmentVariableValue,
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

export function generateDeploymentSettings(
  pkg: SolutionPackage,
  edits: SolutionEdits,
): DeploymentSettings {
  return {
    EnvironmentVariables: pkg.environmentVariables.map((variable) => ({
      SchemaName: variable.schemaName,
      Value: effectiveEnvironmentValue(pkg, edits, variable.schemaName),
    })),
    ConnectionReferences: pkg.connectionReferences.map((reference) => ({
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
  let solutionXml = edits.solutionXmlOverride ?? pkg.solutionXml
  solutionXml = setSolutionVersion(solutionXml, edits.version)
  solutionXml = setManagedFlag(solutionXml, edits.managed)
  if (edits.removeMissingDependencies) {
    solutionXml = removeMissingDependencies(solutionXml)
  }

  const solutionValidation = validateXml(solutionXml)
  if (!solutionValidation.valid) {
    throw new Error(`The edited solution.xml is not valid XML. ${solutionValidation.error}`)
  }

  let customizationsXml = edits.customizationsXmlOverride ?? pkg.customizationsXml
  let appliedEnvironmentVariables = 0
  if (customizationsXml) {
    for (const [schemaName, value] of Object.entries(edits.envVarValues)) {
      const definition = pkg.environmentVariables.find(
        (variable) => variable.schemaName === schemaName,
      )
      if (!definition) continue
      customizationsXml = setEnvironmentVariableValue(customizationsXml, schemaName, value)
      appliedEnvironmentVariables += 1
    }
    const customizationsValidation = validateXml(customizationsXml)
    if (!customizationsValidation.valid) {
      throw new Error(
        `The edited customizations.xml is not valid XML. ${customizationsValidation.error}`,
      )
    }
  } else if (Object.keys(edits.envVarValues).length > 0) {
    throw new Error(
      'Environment variable values were edited, but this solution has no customizations.xml.',
    )
  }

  const output = new JSZip()
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
