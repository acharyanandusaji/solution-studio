/**
 * `broker` uses the local token helper (no app registration). `entra` uses an
 * SPA registration and MSAL popup sign-in.
 */
export type CloudAuthMode = 'broker' | 'entra'

export interface CloudConfig {
  authMode: CloudAuthMode
  /** Application (client) ID of the Entra SPA registration. */
  clientId: string
  /** Tenant ID or verified domain. `organizations` works for any work account. */
  tenantId: string
  /** Origin of the local token broker, for example http://127.0.0.1:4319. */
  brokerUrl: string
  /** Random key printed by the broker. Persisted locally, never sent anywhere else. */
  brokerKey: string
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
