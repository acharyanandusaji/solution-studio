export interface CloudConfig {
  /** Application (client) ID of the Entra SPA registration. */
  clientId: string
  /** Tenant ID or verified domain. `organizations` works for any work account. */
  tenantId: string
}

export interface CloudEnvironment {
  id: string
  displayName: string
  instanceUrl: string
  environmentType?: string
  state?: string
  isDefault?: boolean
}

export interface CloudSolution {
  solutionId: string
  uniqueName: string
  displayName: string
  version: string
  managed: boolean
  isParent: boolean
}

export interface ImportOptions {
  overwriteUnmanagedCustomizations: boolean
  publishWorkflows: boolean
  skipProductUpdateDependencies: boolean
  bindConnections: boolean
}

export type ImportStage =
  | 'idle'
  | 'building'
  | 'uploading'
  | 'processing'
  | 'succeeded'
  | 'failed'

export interface ImportProgress {
  stage: ImportStage
  message: string
  percent?: number
  asyncOperationId?: string
  importJobKey?: string
}

export interface ImportOutcome {
  succeeded: boolean
  message: string
  asyncOperationId: string
  importJobKey?: string
  log?: string
}

export interface ImportJobHandle {
  asyncOperationId: string
  importJobKey?: string
}
