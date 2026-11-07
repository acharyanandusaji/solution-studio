import type JSZip from 'jszip'

export type ManagedIntent = 'unmanaged' | 'managed'

export interface LocalizedName {
  languageCode: string
  description: string
}

export interface PublisherInfo {
  uniqueName: string
  displayName: string
  prefix: string
  optionValuePrefix: string
  email?: string
  website?: string
}

export interface RootComponent {
  type: number
  typeName: string
  id?: string
  schemaName?: string
  behavior?: string
  parentId?: string
}

export interface DependencyItem {
  type?: number
  typeName: string
  schemaName?: string
  displayName?: string
  parentSchemaName?: string
  parentDisplayName?: string
  id?: string
}

export interface MissingDependency {
  id: string
  required: DependencyItem
  dependency: DependencyItem
}

export interface EnvironmentVariable {
  schemaName: string
  displayName: string
  description?: string
  type: number
  typeName: string
  defaultValue: string
  currentValue: string
  explicitValue: boolean
  secret: boolean
}

export interface ConnectionReference {
  logicalName: string
  displayName: string
  connectorId: string
  connectionId: string
  description?: string
}

export interface SolutionInfo {
  uniqueName: string
  displayName: string
  description?: string
  version: string
  managed: boolean
  managedRaw: string
  publisher: PublisherInfo
  versionRaw: string
  languageCode: string
  rootComponents: RootComponent[]
  missingDependencies: MissingDependency[]
  hasMissingDependenciesNode: boolean
  missingDependenciesXml: string
}

export interface ZipFileInfo {
  path: string
  size: number
  compressedSize: number
  isDirectory: boolean
  date: string | null
  extension: string
}

export interface SolutionPackage {
  fileName: string
  fileSize: number
  sourceFile: File
  zip: JSZip
  solutionXml: string
  solutionPath: string
  customizationsXml: string
  customizationsPath: string
  solution: SolutionInfo
  environmentVariables: EnvironmentVariable[]
  /** schema name -> ZIP path of its environmentvariablevalues.json, when exported separately */
  environmentVariableValuePaths: Record<string, string>
  connectionReferences: ConnectionReference[]
  files: ZipFileInfo[]
  loadedAt: string
  hasWebResources: boolean
  hasPluginAssemblies: boolean
  hasFlows: boolean
  hasCanvasApps: boolean
}

export interface SolutionEdits {
  version: string
  managed: boolean
  removeMissingDependencies: boolean
  envVarValues: Record<string, string>
  connectionIds: Record<string, string>
  connectionConnectorIds?: Record<string, string>
  solutionXmlOverride?: string
  customizationsXmlOverride?: string
}

export interface ValidationCheck {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail' | 'info'
  detail: string
  category: 'package' | 'metadata' | 'deployment' | 'security'
}

export interface HealthReport {
  score: number
  checks: ValidationCheck[]
  passed: number
  warnings: number
  failed: number
}

export interface ChangeItem {
  id: string
  label: string
  before?: string
  after?: string
  category: 'solution' | 'environment' | 'package'
}

export interface VersionHistoryEntry {
  id: string
  solutionUniqueName: string
  version: string
  managed: boolean
  missingDependenciesRemoved: boolean
  envVarChanges: number
  timestamp: string
  fileName: string
}

export interface DeploymentProfile {
  id: string
  name: string
  environment: string
  values: Record<string, string>
  connectionIds: Record<string, string>
  updatedAt: string
}

export interface DeploymentSettings {
  EnvironmentVariables: Array<{ SchemaName: string; Value: string }>
  ConnectionReferences: Array<{
    LogicalName: string
    ConnectionId: string
    ConnectorId: string
  }>
}

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface ToastMessage {
  id: number
  kind: ToastKind
  title: string
  detail?: string
}

export type TabId =
  | 'overview'
  | 'solution'
  | 'environment'
  | 'connections'
  | 'dependencies'
  | 'deployment'
  | 'files'
  | 'advanced'
