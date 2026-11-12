import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Cloud,
  Download,
  ExternalLink,
  KeyRound,
  Link2,
  LogIn,
  LogOut,
  Package,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import type { SolutionEdits, SolutionPackage, ToastKind } from '../types'
import type { BuildResult } from '../lib/package'
import { generateDeploymentSettings } from '../lib/package'
import { cx, formatBytes } from '../lib/format'
import {
  dataverseScopes,
  describeAuthError,
  getActiveAccount,
  LEGACY_POWER_PLATFORM_SCOPES,
  POWER_PLATFORM_SCOPES,
  signIn,
  signOut,
} from '../lib/cloud/auth'
import {
  checkBroker,
  DEFAULT_BROKER_URL,
  getBrokerAccount,
  normalizeBrokerUrl,
} from '../lib/cloud/broker'
import {
  cloudRedirectUri,
  getCloudConfig,
  isCloudConfigured,
  saveCloudConfig,
} from '../lib/cloud/config'
import { acquireCloudToken } from '../lib/cloud/tokens'
import {
  buildComponentParameters,
  exportSolution,
  listSolutions,
  normalizeOrgUrl,
  retrieveImportLog,
  startImport,
  waitForImport,
} from '../lib/cloud/dataverse'
import { listEnvironments, listEnvironmentsLegacy } from '../lib/cloud/powerplatform'
import type {
  CloudAuthMode,
  CloudConfig,
  CloudEnvironment,
  CloudSolution,
  ImportOptions,
  ImportOutcome,
  ImportProgress,
} from '../lib/cloud/types'
import {
  Badge,
  Button,
  CopyButton,
  EmptyState,
  Field,
  Modal,
  SearchInput,
  SectionCard,
  Toggle,
} from './ui'

type BusyKind = 'signin' | 'environments' | 'solutions' | 'export' | 'import' | null

interface ConnectedAccount {
  name: string
  username: string
  tenantId?: string
  mode: CloudAuthMode
}

function configFromDraft(draft: CloudConfig): CloudConfig {
  return {
    authMode: draft.authMode,
    clientId: draft.clientId.trim(),
    tenantId: draft.tenantId.trim() || 'organizations',
    brokerUrl:
      draft.authMode === 'broker' ? normalizeBrokerUrl(draft.brokerUrl) : draft.brokerUrl.trim(),
    brokerKey: draft.brokerKey.trim(),
  }
}

const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  overwriteUnmanagedCustomizations: false,
  publishWorkflows: true,
  skipProductUpdateDependencies: false,
  bindConnections: true,
}

function environmentLabel(environment: CloudEnvironment): string {
  const suffix = environment.isDefault ? ' · default' : ''
  return `${environment.displayName}${suffix}`
}

/**
 * Lists environments through the current Power Platform API. If the app
 * registration predates that API (or lacks its permission), retry once with the
 * legacy BAP endpoint and scope.
 */
async function discoverEnvironments(
  config: CloudConfig,
  interactive: boolean,
): Promise<CloudEnvironment[]> {
  let primaryError: unknown
  try {
    const token = await acquireCloudToken(config, POWER_PLATFORM_SCOPES, { interactive })
    return await listEnvironments(token)
  } catch (error) {
    primaryError = error
  }

  try {
    const legacyToken = await acquireCloudToken(config, LEGACY_POWER_PLATFORM_SCOPES, { interactive })
    return await listEnvironmentsLegacy(legacyToken)
  } catch {
    throw primaryError
  }
}

export function CloudTab({
  pkg,
  edits,
  onExported,
  onBuildPackage,
  onNotify,
  standalone = false,
  onClose,
}: {
  pkg?: SolutionPackage | null
  edits?: SolutionEdits | null
  onExported: (file: File) => void | Promise<void>
  onBuildPackage?: () => Promise<BuildResult | null>
  onNotify: (kind: ToastKind, title: string, detail?: string) => void
  standalone?: boolean
  onClose?: () => void
}) {
  const [config, setConfig] = useState<CloudConfig>(() => getCloudConfig())
  const [draft, setDraft] = useState<CloudConfig>(config)
  const [editingConfig, setEditingConfig] = useState(() => !isCloudConfigured(config))
  const [account, setAccount] = useState<ConnectedAccount | null>(null)
  const [busy, setBusy] = useState<BusyKind>(null)
  const [authError, setAuthError] = useState<string>()
  const [brokerTest, setBrokerTest] = useState<{ ok: boolean; message: string } | null>(null)
  const [envError, setEnvError] = useState<string>()
  const [solutionError, setSolutionError] = useState<string>()
  const [environments, setEnvironments] = useState<CloudEnvironment[]>([])
  const [solutions, setSolutions] = useState<CloudSolution[]>([])
  const [sourceUrl, setSourceUrl] = useState('')
  const [activeSourceUrl, setActiveSourceUrl] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<CloudSolution | null>(null)
  const [exportManaged, setExportManaged] = useState(false)
  const [importOptions, setImportOptions] = useState<ImportOptions>(DEFAULT_IMPORT_OPTIONS)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<ImportOutcome | null>(null)
  const [importLog, setImportLog] = useState<string>()

  useEffect(() => {
    let cancelled = false
    if (!isCloudConfigured(config)) return

    if (config.authMode === 'broker') {
      void getBrokerAccount(config)
        .then((brokerAccount) => {
          if (!cancelled) setAccount({ ...brokerAccount, mode: 'broker' })
        })
        .catch(() => {
          // The helper may not be running yet. The connect button reports details.
        })
    } else {
      void getActiveAccount(config).then((active) => {
        if (!cancelled && active) {
          setAccount({
            name: active.name || active.username,
            username: active.username,
            tenantId: active.tenantId,
            mode: 'entra',
          })
        }
      })
    }

    return () => {
      cancelled = true
    }
  }, [config])

  const configured = isCloudConfigured(config)
  const redirectUri = cloudRedirectUri()

  const filteredSolutions = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return solutions
    return solutions.filter((solution) =>
      `${solution.displayName} ${solution.uniqueName}`.toLowerCase().includes(term),
    )
  }, [filter, solutions])

  const targetEnvironment = useMemo(() => {
    const normalized = targetUrl.trim().replace(/\/+$/, '')
    return environments.find((environment) => environment.instanceUrl === normalized)
  }, [environments, targetUrl])

  const canDeploy = Boolean(pkg && edits && onBuildPackage)

  async function refreshEnvironments(interactive: boolean) {
    setEnvError(undefined)
    setBusy('environments')
    try {
      const list = await discoverEnvironments(config, interactive)
      setEnvironments(list)
      setSourceUrl((current) => current || list[0]?.instanceUrl || '')
      setTargetUrl((current) => current || list[1]?.instanceUrl || list[0]?.instanceUrl || '')
      if (list.length === 0) {
        setEnvError('No environments were returned for this account. Paste an environment URL instead.')
      }
    } catch (error) {
      setEnvError(describeAuthError(error))
    } finally {
      setBusy(null)
    }
  }

  async function handleSaveConfig() {
    let next: CloudConfig
    try {
      next = configFromDraft(draft)
    } catch (error) {
      setAuthError(describeAuthError(error))
      return
    }
    if (!isCloudConfigured(next)) {
      setAuthError(
        next.authMode === 'broker'
          ? 'Enter the broker URL and the key printed when you started the helper.'
          : 'Enter a valid application (client) ID. It is a GUID, not the display name.',
      )
      return
    }
    saveCloudConfig(next)
    setConfig(next)
    setDraft(next)
    setEditingConfig(false)
    setAuthError(undefined)
    setBrokerTest(null)
    setAccount(null)
    setEnvironments([])
    setSolutions([])
    onNotify(
      'success',
      'Configuration saved',
      next.authMode === 'broker'
        ? 'Start the broker if it is not running, then connect.'
        : 'Sign in with your Microsoft work account to continue.',
    )
  }

  async function handleConnect() {
    setAuthError(undefined)
    setBusy('signin')
    try {
      if (config.authMode === 'broker') {
        await checkBroker(config)
        const brokerAccount = await getBrokerAccount(config)
        setAccount({ ...brokerAccount, mode: 'broker' })
        onNotify('success', 'Broker connected', brokerAccount.username || 'Azure CLI account')
      } else {
        const active = await signIn(config)
        setAccount({
          name: active.name || active.username,
          username: active.username,
          tenantId: active.tenantId,
          mode: 'entra',
        })
        onNotify('success', 'Signed in', active.username)
      }
      await refreshEnvironments(false)
    } catch (error) {
      setAuthError(describeAuthError(error))
    } finally {
      setBusy(null)
    }
  }

  async function handleTestBroker() {
    setAuthError(undefined)
    setBrokerTest(null)
    setBusy('signin')
    try {
      const candidate = configFromDraft({ ...draft, authMode: 'broker' })
      await checkBroker(candidate)
      const brokerAccount = await getBrokerAccount(candidate)
      setBrokerTest({
        ok: true,
        message: `Broker reachable. Azure CLI account: ${brokerAccount.username || 'unknown'}.`,
      })
    } catch (error) {
      setBrokerTest({ ok: false, message: describeAuthError(error) })
    } finally {
      setBusy(null)
    }
  }

  async function handleSignOut() {
    if (config.authMode === 'entra') {
      try {
        await signOut(config)
      } catch {
        // Clearing the local cache is best effort.
      }
    }
    setAccount(null)
    setEnvironments([])
    setSolutions([])
    setSelected(null)
    setSourceUrl('')
    setActiveSourceUrl('')
    setProgress(null)
    setResult(null)
    onNotify(
      'info',
      config.authMode === 'broker' ? 'Broker disconnected' : 'Signed out',
      config.authMode === 'broker'
        ? 'The page stopped using the broker. Run az logout to end the Azure CLI session.'
        : 'Access tokens were removed from this browser tab.',
    )
  }

  async function handleLoadSolutions() {
    setSolutionError(undefined)
    setBusy('solutions')
    try {
      const org = normalizeOrgUrl(sourceUrl)
      const token = await acquireCloudToken(config, dataverseScopes(org), { interactive: true })
      const list = await listSolutions(org, token)
      setSolutions(list)
      setActiveSourceUrl(org)
      setSourceUrl(org)
      setSelected(null)
      onNotify(
        'success',
        'Solutions loaded',
        `${list.length} solution${list.length === 1 ? '' : 's'} found in ${org}`,
      )
    } catch (error) {
      setSolutionError(describeAuthError(error))
    } finally {
      setBusy(null)
    }
  }

  async function handleExport() {
    if (!selected) return
    setBusy('export')
    try {
      const org = activeSourceUrl || normalizeOrgUrl(sourceUrl)
      const token = await acquireCloudToken(config, dataverseScopes(org), { interactive: true })
      const blob = await exportSolution(org, token, selected.uniqueName, exportManaged)
      const suffix = exportManaged ? 'managed' : 'unmanaged'
      const file = new File(
        [blob],
        `${selected.uniqueName}_${selected.version || '0.0.0.0'}_${suffix}.zip`,
        { type: 'application/zip' },
      )
      onNotify(
        'success',
        'Solution exported',
        `${selected.displayName} · ${formatBytes(blob.size)} · loading into the workspace`,
      )
      await onExported(file)
    } catch (error) {
      onNotify('error', 'Export failed', describeAuthError(error))
    } finally {
      setBusy(null)
    }
  }

  async function runImport() {
    setConfirmOpen(false)
    setAcknowledged(false)
    if (!pkg || !edits || !onBuildPackage) return

    setResult(null)
    setImportLog(undefined)
    setBusy('import')
    setProgress({ stage: 'building', message: 'Rebuilding the solution ZIP with your edits…' })

    try {
      const org = normalizeOrgUrl(targetUrl)
      const built = await onBuildPackage()
      if (!built) throw new Error('No solution package is loaded.')

      setProgress({
        stage: 'uploading',
        message: `Uploading ${built.fileName} (${formatBytes(built.size)}) to ${org}…`,
      })

      const token = await acquireCloudToken(config, dataverseScopes(org), { interactive: true })
      const componentParameters = buildComponentParameters(generateDeploymentSettings(pkg, edits))
      const handle = await startImport(org, token, built.blob, importOptions, componentParameters)

      setProgress({
        stage: 'processing',
        message: 'Dataverse accepted the import. Tracking progress…',
        asyncOperationId: handle.asyncOperationId,
        importJobKey: handle.importJobKey,
      })

      const outcome = await waitForImport(org, token, handle, setProgress)
      if (!outcome.succeeded) {
        const log = await retrieveImportLog(org, token, outcome.importJobKey)
        setImportLog(log)
      }
      setResult(outcome)
      setProgress({
        stage: outcome.succeeded ? 'succeeded' : 'failed',
        message: outcome.message,
        asyncOperationId: outcome.asyncOperationId,
        importJobKey: outcome.importJobKey,
      })
      onNotify(
        outcome.succeeded ? 'success' : 'error',
        outcome.succeeded ? 'Solution imported' : 'Import failed',
        outcome.message,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setResult({ succeeded: false, message, asyncOperationId: '' })
      setProgress({ stage: 'failed', message })
      onNotify('error', 'Import failed', message)
    } finally {
      setBusy(null)
    }
  }

  const content = (
    <div className={cx('cloud-page', standalone && 'cloud-page-standalone')}>
      <div className="cloud-head">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            Power Platform connection
          </div>
          <h1>Work with your environments</h1>
          <p>
            Export a solution from a source environment, edit it in this workspace, then import the
            rebuilt package straight into the target environment. No manual ZIP round-trip.
          </p>
        </div>
        {account ? (
          <Badge tone="success" dot>
            Connected
          </Badge>
        ) : (
          <Badge tone="neutral">Not connected</Badge>
        )}
      </div>

      <div className="cloud-privacy notice notice-info">
        <ShieldCheck size={18} />
        <div>
          <strong>
            {config.authMode === 'broker'
              ? 'Local broker, no app registration.'
              : 'Delegated sign-in, no secrets.'}
          </strong>
          <p>
            {config.authMode === 'broker'
              ? 'A helper on your machine uses your existing Azure CLI login to mint short-lived tokens. The page keeps tokens in memory only; the broker key stays in localStorage.'
              : 'The page signs in with the authorization code flow and PKCE. No client secret or refresh token ever leaves this browser tab. Requests go directly to Microsoft.'}
          </p>
        </div>
      </div>

      <SectionCard
        title="Microsoft account"
        description="Connect through a local token broker or an Entra app registration to call Dataverse and the Power Platform API on your behalf."
        icon={<KeyRound size={18} />}
        actions={
          configured ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<Settings2 size={15} />}
              onClick={() => {
                setDraft(config)
                setBrokerTest(null)
                setEditingConfig((current) => !current)
              }}
            >
              {editingConfig ? 'Close setup' : 'Reconfigure'}
            </Button>
          ) : null
        }
      >
        {!configured || editingConfig ? (
          <div className="cloud-config">
            <div className="cloud-auth-modes" role="radiogroup" aria-label="Sign-in method">
              <button
                type="button"
                role="radio"
                aria-checked={draft.authMode === 'broker'}
                className={cx('cloud-auth-mode', draft.authMode === 'broker' && 'is-active')}
                onClick={() => {
                  setDraft({ ...draft, authMode: 'broker' })
                  setBrokerTest(null)
                  setAuthError(undefined)
                }}
              >
                <span className="cloud-auth-mode-head">
                  <KeyRound size={16} />
                  <strong>Local token broker</strong>
                  <Badge tone="success">No registration</Badge>
                </span>
                <span className="cloud-auth-mode-copy">
                  Uses your existing Azure CLI login. Run a small helper on this machine.
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={draft.authMode === 'entra'}
                className={cx('cloud-auth-mode', draft.authMode === 'entra' && 'is-active')}
                onClick={() => {
                  setDraft({ ...draft, authMode: 'entra' })
                  setBrokerTest(null)
                  setAuthError(undefined)
                }}
              >
                <span className="cloud-auth-mode-head">
                  <ShieldCheck size={16} />
                  <strong>Entra app registration</strong>
                </span>
                <span className="cloud-auth-mode-copy">
                  Browser popup sign-in with a client ID and admin-consented permissions.
                </span>
              </button>
            </div>

            {draft.authMode === 'broker' ? (
              <>
                <div className="cloud-config-grid">
                  <Field
                    label="Broker URL"
                    hint="Printed when the helper starts."
                    htmlFor="cloud-broker-url"
                  >
                    <input
                      id="cloud-broker-url"
                      className="text-input"
                      value={draft.brokerUrl}
                      onChange={(event) => setDraft({ ...draft, brokerUrl: event.target.value })}
                      placeholder={DEFAULT_BROKER_URL}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>
                  <Field
                    label="Broker key"
                    hint="Random key printed by the helper. Stored only in this browser."
                    htmlFor="cloud-broker-key"
                  >
                    <input
                      id="cloud-broker-key"
                      className="text-input"
                      type="password"
                      value={draft.brokerKey}
                      onChange={(event) => setDraft({ ...draft, brokerKey: event.target.value })}
                      placeholder="Paste the broker key"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>
                </div>

                <div className="cloud-redirect">
                  <div>
                    <span className="cloud-redirect-label">Run in a terminal after az login</span>
                    <code>node tools/token-broker.mjs</code>
                  </div>
                  <CopyButton text="node tools/token-broker.mjs" label="Copy command" />
                </div>

                <ol className="cloud-checklist">
                  <li>
                    Install the <strong>Azure CLI</strong> and run <code>az login</code> once.
                  </li>
                  <li>
                    From this project folder, run <code>node tools/token-broker.mjs</code>.
                  </li>
                  <li>
                    Copy the <strong>Broker URL</strong> and <strong>Broker key</strong> it prints into
                    the fields above.
                  </li>
                  <li>
                    Save, then choose <strong>Connect to broker</strong>. No app registration or admin
                    consent is needed.
                  </li>
                </ol>

                <div className="cloud-actions">
                  <Button
                    variant="primary"
                    icon={<KeyRound size={16} />}
                    onClick={() => void handleSaveConfig()}
                  >
                    Save configuration
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<RefreshCw size={15} />}
                    loading={busy === 'signin'}
                    onClick={() => void handleTestBroker()}
                  >
                    Test connection
                  </Button>
                  {configured ? (
                    <Button variant="ghost" onClick={() => setEditingConfig(false)}>
                      Cancel
                    </Button>
                  ) : null}
                </div>

                {brokerTest ? (
                  <div
                    className={cx(
                      'cloud-broker-test',
                      brokerTest.ok ? 'is-success' : 'is-failure',
                    )}
                  >
                    {brokerTest.ok ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
                    <span>{brokerTest.message}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="cloud-config-grid">
                  <Field
                    label="Application (client) ID"
                    hint="From the Entra app registration. A GUID."
                    htmlFor="cloud-client-id"
                  >
                    <input
                      id="cloud-client-id"
                      className="text-input"
                      value={draft.clientId}
                      onChange={(event) => setDraft({ ...draft, clientId: event.target.value })}
                      placeholder="00000000-0000-0000-0000-000000000000"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>
                  <Field
                    label="Tenant ID or domain"
                    hint="Use organizations to accept any work account."
                    htmlFor="cloud-tenant-id"
                  >
                    <input
                      id="cloud-tenant-id"
                      className="text-input"
                      value={draft.tenantId}
                      onChange={(event) => setDraft({ ...draft, tenantId: event.target.value })}
                      placeholder="contoso.onmicrosoft.com"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>
                </div>

                <div className="cloud-redirect">
                  <div>
                    <span className="cloud-redirect-label">Redirect URI registered in Entra</span>
                    <code>{redirectUri}</code>
                  </div>
                  <CopyButton text={redirectUri} label="Copy URI" />
                </div>

                <ol className="cloud-checklist">
                  <li>
                    <strong>Register a single-page application</strong> in Microsoft Entra ID.
                  </li>
                  <li>
                    Add the redirect URI above under <em>Single-page application</em>.
                  </li>
                  <li>
                    Add delegated permissions: <code>Dynamics CRM → user_impersonation</code> and{' '}
                    <code>Power Platform API → EnvironmentManagement.Environments.Read</code>, then
                    grant admin consent.
                  </li>
                  <li>
                    Older registrations can use <code>Power Apps Service → user_impersonation</code>{' '}
                    instead; the app falls back to the legacy environment API.
                  </li>
                  <li>Paste the application (client) ID and tenant above and save.</li>
                </ol>

                <div className="cloud-actions">
                  <Button
                    variant="primary"
                    icon={<KeyRound size={16} />}
                    onClick={() => void handleSaveConfig()}
                  >
                    Save configuration
                  </Button>
                  {configured ? (
                    <Button variant="ghost" onClick={() => setEditingConfig(false)}>
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ) : account ? (
          <div className="cloud-account">
            <div className="cloud-avatar" aria-hidden="true">
              {(account.name || account.username || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="cloud-account-copy">
              <strong>{account.name || account.username}</strong>
              <span>{account.username}</span>
              <span className="cloud-account-tenant">
                <ShieldCheck size={13} />{' '}
                {account.mode === 'broker' ? 'Local broker' : 'Microsoft Entra'}
                {account.tenantId ? ` · ${account.tenantId}` : ''}
              </span>
            </div>
            <div className="cloud-actions">
              <Button
                variant="secondary"
                icon={<RefreshCw size={15} />}
                loading={busy === 'environments'}
                onClick={() => void refreshEnvironments(true)}
              >
                Refresh environments
              </Button>
              <Button variant="ghost" icon={<LogOut size={15} />} onClick={() => void handleSignOut()}>
                {account.mode === 'broker' ? 'Disconnect' : 'Sign out'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="cloud-signin">
            <div>
              <strong>
                {config.authMode === 'broker' ? 'Connect to the local broker' : 'Sign in to continue'}
              </strong>
              <p>
                {config.authMode === 'broker'
                  ? 'Make sure the helper is running, then connect. It uses your Azure CLI session, so no token is pasted and no app registration is needed.'
                  : 'Your browser opens a Microsoft sign-in popup. Access tokens stay in this tab’s session storage and are cleared when you sign out or close the tab.'}
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              icon={config.authMode === 'broker' ? <KeyRound size={17} /> : <LogIn size={17} />}
              loading={busy === 'signin'}
              onClick={() => void handleConnect()}
            >
              {config.authMode === 'broker' ? 'Connect to broker' : 'Sign in with Microsoft'}
            </Button>
          </div>
        )}

        {authError ? <div className="cloud-error">{authError}</div> : null}
        {envError ? <div className="cloud-error">{envError}</div> : null}
      </SectionCard>

      {account ? (
        <>
          <SectionCard
            title="Source environment"
            description="Choose where the solution lives, then load its solutions."
            icon={<Server size={18} />}
            actions={
              <Badge tone={environments.length > 0 ? 'info' : 'neutral'}>
                {environments.length > 0
                  ? `${environments.length} discoverable`
                  : 'Manual URL'}
              </Badge>
            }
          >
            <div className="cloud-source">
              <Field
                label="Environment URL"
                hint="Pick a discovered environment or paste any Dataverse URL."
                htmlFor="cloud-source-url"
              >
                <input
                  id="cloud-source-url"
                  className="text-input"
                  list="cloud-environment-options"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://org.crm.dynamics.com"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <datalist id="cloud-environment-options">
                {environments.map((environment) => (
                  <option key={environment.id} value={environment.instanceUrl}>
                    {environmentLabel(environment)}
                  </option>
                ))}
              </datalist>
              <div className="cloud-actions">
                <Button
                  variant="secondary"
                  icon={<RefreshCw size={15} />}
                  loading={busy === 'environments'}
                  onClick={() => void refreshEnvironments(true)}
                >
                  Discover
                </Button>
                <Button
                  variant="primary"
                  icon={<Cloud size={16} />}
                  loading={busy === 'solutions'}
                  disabled={!sourceUrl.trim()}
                  onClick={() => void handleLoadSolutions()}
                >
                  Load solutions
                </Button>
              </div>
            </div>

            {environments.length > 0 ? (
              <div className="cloud-env-chips">
                {environments.slice(0, 12).map((environment) => (
                  <button
                    type="button"
                    key={environment.id}
                    className={cx(
                      'cloud-env-chip',
                      sourceUrl.trim().replace(/\/+$/, '') === environment.instanceUrl && 'is-active',
                    )}
                    onClick={() => setSourceUrl(environment.instanceUrl)}
                    title={environment.instanceUrl}
                  >
                    <strong>{environmentLabel(environment)}</strong>
                    <span>{environment.environmentType || environment.state || 'Environment'}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {solutionError ? <div className="cloud-error">{solutionError}</div> : null}
          </SectionCard>

          <SectionCard
            title="Solutions"
            description="Only visible, parent solutions are listed. Patches and system solutions are hidden."
            icon={<Package size={18} />}
            actions={
              solutions.length > 0 ? (
                <Badge tone="info">
                  {solutions.length} solution{solutions.length === 1 ? '' : 's'}
                </Badge>
              ) : null
            }
          >
            {solutions.length === 0 ? (
              <EmptyState
                icon={<Cloud size={26} />}
                title="No solutions loaded"
                description={
                  activeSourceUrl
                    ? 'This environment returned no visible solutions. Try another environment.'
                    : 'Pick a source environment and select Load solutions.'
                }
                action={
                  <Button
                    variant="secondary"
                    icon={<Cloud size={16} />}
                    loading={busy === 'solutions'}
                    disabled={!sourceUrl.trim()}
                    onClick={() => void handleLoadSolutions()}
                  >
                    Load solutions
                  </Button>
                }
              />
            ) : (
              <>
                <div className="cloud-solution-toolbar">
                  <SearchInput
                    value={filter}
                    onChange={setFilter}
                    placeholder="Search by name or unique name"
                    ariaLabel="Search solutions"
                  />
                  <span className="cloud-solution-count">
                    {filteredSolutions.length} shown
                  </span>
                </div>

                <div className="cloud-solutions" role="listbox" aria-label="Solutions">
                  {filteredSolutions.map((solution) => {
                    const active = selected?.uniqueName === solution.uniqueName
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        key={solution.solutionId || solution.uniqueName}
                        className={cx('cloud-solution', active && 'is-selected')}
                        onClick={() => {
                          setSelected(solution)
                          setExportManaged(solution.managed)
                        }}
                      >
                        <span className="cloud-solution-main">
                          <strong>{solution.displayName}</strong>
                          <span>{solution.uniqueName}</span>
                        </span>
                        <span className="cloud-solution-meta">
                          <Badge tone="neutral">v{solution.version || '—'}</Badge>
                          <Badge tone={solution.managed ? 'violet' : 'success'}>
                            {solution.managed ? 'Managed' : 'Unmanaged'}
                          </Badge>
                        </span>
                      </button>
                    )
                  })}
                  {filteredSolutions.length === 0 ? (
                    <div className="cloud-empty-row">No solution matches “{filter}”.</div>
                  ) : null}
                </div>

                <div className="cloud-export">
                  <Toggle
                    checked={exportManaged}
                    onChange={setExportManaged}
                    label="Export as managed"
                    description={
                      selected?.managed
                        ? 'Managed solutions can be imported as-is. Unmanaged export only works when the source is unmanaged.'
                        : 'Unmanaged exports are easier to edit and re-import.'
                    }
                  />
                  <Button
                    variant="primary"
                    size="lg"
                    icon={<Download size={16} />}
                    loading={busy === 'export'}
                    disabled={!selected}
                    onClick={() => void handleExport()}
                  >
                    Export &amp; edit
                  </Button>
                </div>
                {selected ? (
                  <p className="cloud-export-hint">
                    <Link2 size={14} />
                    Exporting <strong>{selected.displayName}</strong> from{' '}
                    <code>{activeSourceUrl || sourceUrl}</code>. The ZIP loads into this workspace
                    without touching your local files.
                  </p>
                ) : null}
              </>
            )}
          </SectionCard>
        </>
      ) : null}

      {canDeploy ? (
        <SectionCard
          title="Import to a target environment"
          description="Builds the edited package in memory, uploads it, and tracks the Dataverse import job."
          icon={<Upload size={18} />}
          actions={
            pkg ? (
              <Badge tone={edits?.managed ? 'violet' : 'success'} dot>
                {pkg.solution.displayName} v{edits?.version}
              </Badge>
            ) : null
          }
        >
          <div className="cloud-import-grid">
            <Field
              label="Target environment URL"
              hint="Dataverse imports are destructive: the solution is installed or upgraded here."
              htmlFor="cloud-target-url"
            >
              <input
                id="cloud-target-url"
                className="text-input"
                list="cloud-environment-options"
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
                placeholder="https://target.crm.dynamics.com"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <div className="cloud-target-summary">
              <Server size={16} />
              <div>
                <strong>{targetEnvironment ? targetEnvironment.displayName : 'Custom URL'}</strong>
                <span>{targetUrl || 'No target selected'}</span>
              </div>
            </div>
          </div>

          <div className="cloud-options">
            <Toggle
              checked={importOptions.overwriteUnmanagedCustomizations}
              onChange={(next) =>
                setImportOptions({ ...importOptions, overwriteUnmanagedCustomizations: next })
              }
              label="Overwrite unmanaged customizations"
              description="Replaces unmanaged layers applied on top of the imported managed components."
            />
            <Toggle
              checked={importOptions.publishWorkflows}
              onChange={(next) => setImportOptions({ ...importOptions, publishWorkflows: next })}
              label="Publish workflows"
              description="Activates processes included in the solution after import."
            />
            <Toggle
              checked={importOptions.skipProductUpdateDependencies}
              onChange={(next) =>
                setImportOptions({ ...importOptions, skipProductUpdateDependencies: next })
              }
              label="Skip product update dependencies"
              description="Only use this when the target environment intentionally lacks product updates."
            />
            <Toggle
              checked={importOptions.bindConnections}
              onChange={(next) => setImportOptions({ ...importOptions, bindConnections: next })}
              label="Bind connection references"
              description="Sends the connection IDs from Deployment settings as import component parameters."
            />
          </div>

          <div className="notice notice-warning cloud-import-warning">
            <AlertTriangle size={18} />
            <div>
              <strong>This changes the target environment.</strong>
              <p>
                Importing installs or upgrades <code>{pkg?.solution.uniqueName}</code> at version{' '}
                <code>{edits?.version}</code>. Create a backup solution in the target first if the
                deployment is not reversible.
              </p>
            </div>
          </div>

          <div className="cloud-actions cloud-actions-end">
            <Button
              variant="danger"
              size="lg"
              icon={<Upload size={16} />}
              loading={busy === 'import'}
              disabled={!targetUrl.trim() || !account}
              onClick={() => {
                setAcknowledged(false)
                setConfirmOpen(true)
              }}
            >
              Import solution
            </Button>
          </div>

          {!account ? (
            <p className="cloud-export-hint">
              <LogIn size={14} />{' '}
              {config.authMode === 'broker'
                ? 'Connect to the local broker above before importing.'
                : 'Sign in to a Microsoft account above before importing.'}
            </p>
          ) : null}

          {progress ? <ImportProgressPanel progress={progress} /> : null}
          {result ? (
            <div className={cx('cloud-result', result.succeeded ? 'is-success' : 'is-failure')}>
              <div className="cloud-result-head">
                {result.succeeded ? <CheckCircle2 size={20} /> : <CircleAlert size={20} />}
                <div>
                  <strong>{result.succeeded ? 'Import succeeded' : 'Import failed'}</strong>
                  <span>{result.message}</span>
                </div>
              </div>
              {importLog ? <pre className="cloud-log">{importLog}</pre> : null}
              <div className="cloud-result-actions">
                {targetUrl ? (
                  <a
                    className="cloud-link"
                    href={`${targetUrl.replace(/\/+$/, '')}/main.aspx`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open target environment <ExternalLink size={14} />
                  </a>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Import into the target environment?"
        description="This action writes to Dataverse and cannot be undone from this page."
        size="sm"
        footer={
          <>
            <span className="modal-footer-note" />
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<Upload size={16} />}
              disabled={!acknowledged}
              onClick={() => void runImport()}
            >
              Import now
            </Button>
          </>
        }
      >
        <div className="cloud-confirm">
          <p>
            <strong>{pkg?.solution.displayName}</strong> v{edits?.version} will be imported into{' '}
            <code>{targetUrl}</code>.
          </p>
          <label className="ack-row">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              <strong>I understand this modifies the target environment.</strong>
              <span>
                Existing components may be overwritten depending on the options selected. Keep a
                backup solution if you need to roll back.
              </span>
            </span>
            <AlertTriangle size={16} />
          </label>
        </div>
      </Modal>
    </div>
  )

  if (!standalone) return content

  return (
    <div className="cloud-standalone">
      <header className="cloud-standalone-head">
        <div className="brand">
          <span className="brand-mark">
            <Cloud size={21} />
          </span>
          <span className="brand-copy">
            <strong>Solution Studio</strong>
            <span>Power Platform connection</span>
          </span>
        </div>
        <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={onClose}>
          Back to upload
        </Button>
      </header>
      <main className="cloud-standalone-main">{content}</main>
    </div>
  )
}

function ImportProgressPanel({ progress }: { progress: ImportProgress }) {
  const tone =
    progress.stage === 'succeeded' ? 'is-success' : progress.stage === 'failed' ? 'is-failure' : 'is-running'
  return (
    <div className={cx('cloud-progress', tone)}>
      <div className="cloud-progress-head">
        <span className="cloud-progress-icon">
          {progress.stage === 'succeeded' ? (
            <CheckCircle2 size={18} />
          ) : progress.stage === 'failed' ? (
            <CircleAlert size={18} />
          ) : (
            <RefreshCw size={18} className="spin" />
          )}
        </span>
        <div>
          <strong>
            {progress.stage === 'building'
              ? 'Rebuilding package'
              : progress.stage === 'uploading'
                ? 'Uploading solution'
                : progress.stage === 'processing'
                  ? 'Import in progress'
                  : progress.stage === 'succeeded'
                    ? 'Import complete'
                    : 'Import failed'}
          </strong>
          <span>{progress.message}</span>
        </div>
      </div>
      {progress.stage === 'processing' && progress.percent !== undefined ? (
        <div className="cloud-progress-bar">
          <span style={{ width: `${progress.percent}%` }} />
        </div>
      ) : null}
      {progress.asyncOperationId || progress.importJobKey ? (
        <div className="cloud-progress-meta">
          {progress.asyncOperationId ? (
            <code>Async operation {progress.asyncOperationId}</code>
          ) : null}
          {progress.importJobKey ? <code>Import job {progress.importJobKey}</code> : null}
        </div>
      ) : null}
    </div>
  )
}
