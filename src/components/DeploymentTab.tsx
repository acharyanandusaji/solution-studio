import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Cable,
  Check,
  ChevronRight,
  ClipboardCheck,
  CloudUpload,
  Download,
  FileJson,
  FolderOpen,
  History,
  Info,
  KeyRound,
  Rocket,
  Save,
  ShieldCheck,
  Trash2,
  Variable,
} from 'lucide-react'
import type {
  DeploymentProfile,
  SolutionEdits,
  SolutionPackage,
} from '../types'
import {
  effectiveConnectionId,
  effectiveConnectionReferences,
  effectiveEnvironmentValue,
  generateDeploymentSettings,
} from '../lib/package'
import { formatTimeAgo, pluralize, uid } from '../lib/format'
import { downloadText } from '../lib/package'
import { ENV_PROFILES } from '../lib/constants'
import { Button, CopyButton, Field, SectionCard } from './ui'

export function DeploymentTab({
  pkg,
  edits,
  profiles,
  onApplyProfile,
  onSaveProfile,
  onDeleteProfile,
  onApplyImportedSettings,
  onOpenConnections,
  onNotify,
}: {
  pkg: SolutionPackage
  edits: SolutionEdits
  profiles: DeploymentProfile[]
  onApplyProfile: (profile: DeploymentProfile) => void
  onSaveProfile: (profile: DeploymentProfile) => void
  onDeleteProfile: (profileId: string) => void
  onApplyImportedSettings: (settings: {
    envValues: Record<string, string>
    connectionIds: Record<string, string>
  }) => void
  onOpenConnections: () => void
  onNotify: (kind: 'success' | 'error' | 'info', title: string, detail?: string) => void
}) {
  const [profileName, setProfileName] = useState('')
  const [environment, setEnvironment] = useState<(typeof ENV_PROFILES)[number]['id']>('dev')
  const [importMessage, setImportMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const settings = useMemo(() => generateDeploymentSettings(pkg, edits), [pkg, edits])
  const settingsJson = useMemo(() => JSON.stringify(settings, null, 2), [settings])
  const effectiveReferences = useMemo(
    () => effectiveConnectionReferences(pkg, edits),
    [pkg, edits],
  )
  const mergedReferenceCount = pkg.connectionReferences.length - effectiveReferences.length
  const configuredConnections = effectiveReferences.filter((reference) =>
    effectiveConnectionId(edits, reference.logicalName).trim(),
  ).length
  const emptyConnections = effectiveReferences.length - configuredConnections
  const emptyEnvVars = pkg.environmentVariables.filter(
    (variable) => !variable.secret && effectiveEnvironmentValue(pkg, edits, variable.schemaName).trim() === '',
  ).length
  const secrets = pkg.environmentVariables.filter((variable) => variable.secret).length
  const settingsFileName = `${pkg.solution.uniqueName.replace(/[^a-zA-Z0-9._-]/g, '_')}.deploymentSettings.json`

  const saveProfile = () => {
    const environmentLabel = ENV_PROFILES.find((item) => item.id === environment)?.label ?? 'Custom'
    const name = profileName.trim() || `${environmentLabel} profile`
    onSaveProfile({
      id: uid(),
      name,
      environment,
      values: { ...edits.envVarValues },
      connectionIds: { ...edits.connectionIds },
      updatedAt: new Date().toISOString(),
    })
    setProfileName('')
    onNotify('success', 'Deployment profile saved', `${name} is stored locally in this browser.`)
  }

  const importSettings = async (file: File | undefined) => {
    if (!file) return
    setImportMessage(null)
    try {
      const parsed = JSON.parse(await file.text()) as {
        EnvironmentVariables?: Array<{ SchemaName?: string; Value?: string }>
        ConnectionReferences?: Array<{
          LogicalName?: string
          ConnectionId?: string
          ConnectorId?: string
        }>
      }
      if (!Array.isArray(parsed.EnvironmentVariables) && !Array.isArray(parsed.ConnectionReferences)) {
        throw new Error('Expected EnvironmentVariables and/or ConnectionReferences arrays.')
      }
      const envValues: Record<string, string> = {}
      for (const item of parsed.EnvironmentVariables ?? []) {
        if (!item.SchemaName || typeof item.Value !== 'string') continue
        if (!pkg.environmentVariables.some((variable) => variable.schemaName === item.SchemaName)) continue
        envValues[item.SchemaName] = item.Value
      }
      const connectionIds: Record<string, string> = {}
      for (const item of parsed.ConnectionReferences ?? []) {
        if (!item.LogicalName || typeof item.ConnectionId !== 'string') continue
        if (!effectiveReferences.some((reference) => reference.logicalName === item.LogicalName)) continue
        connectionIds[item.LogicalName] = item.ConnectionId
      }
      onApplyImportedSettings({
        envValues,
        connectionIds,
      })
      const message = `Imported ${Object.keys(envValues).length} environment value${
        Object.keys(envValues).length === 1 ? '' : 's'
      } and ${Object.keys(connectionIds).length} connection ID${
        Object.keys(connectionIds).length === 1 ? '' : 's'
      }.`
      setImportMessage({ kind: 'success', text: message })
      onNotify('success', 'Deployment settings imported', message)
    } catch (error) {
      setImportMessage({ kind: 'error', text: `Could not import settings: ${(error as Error).message}` })
      onNotify('error', 'Import failed', (error as Error).message)
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  return (
    <div className="tab-stack">
      <div className="tab-heading">
        <div>
          <h1>Deployment settings</h1>
          <p>
            Build a PAC CLI-compatible <code>DeploymentSettings.json</code> with environment values and
            connection mappings for this package.
          </p>
        </div>
        <div className="heading-actions">
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => void importSettings(event.target.files?.[0])}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<CloudUpload size={15} />}
            onClick={() => importRef.current?.click()}
          >
            Import settings
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Download size={15} />}
            onClick={() => {
              downloadText(settingsJson, settingsFileName, 'application/json')
              onNotify('success', 'Deployment settings downloaded', settingsFileName)
            }}
          >
            Download JSON
          </Button>
        </div>
      </div>

      {importMessage ? (
        <div className={`notice ${importMessage.kind === 'success' ? 'notice-success' : 'notice-danger'}`}>
          {importMessage.kind === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{importMessage.kind === 'success' ? 'Settings applied' : 'Import problem'}</strong>
            <p>{importMessage.text}</p>
          </div>
        </div>
      ) : null}

      <div className="env-summary">
        <div className="env-summary-item">
          <Variable size={17} />
          <span>
            <strong>{pkg.environmentVariables.length}</strong> env values
          </span>
        </div>
        <div className="env-summary-item">
          <Cable size={17} />
          <span>
            <strong>{configuredConnections}</strong> / {effectiveReferences.length} connections
            {mergedReferenceCount > 0 ? ` (${mergedReferenceCount} merged)` : ''}
          </span>
        </div>
        <div className="env-summary-item">
          <AlertTriangle size={17} />
          <span>
            <strong>{emptyConnections + emptyEnvVars}</strong> items to review
          </span>
        </div>
        <div className="env-summary-item">
          <KeyRound size={17} />
          <span>
            <strong>{secrets}</strong> secrets
          </span>
        </div>
      </div>

      {mergedReferenceCount > 0 ? (
        <div className="notice notice-info">
          <Cable size={19} />
          <div>
            <strong>
              {pluralize(mergedReferenceCount, 'merged connection reference')} excluded from deployment
              settings.
            </strong>
            <p>
              The rebuilt ZIP removes these references and rewrites their flows to use the surviving
              reference. Only the survivors need a target connection ID.
            </p>
          </div>
        </div>
      ) : null}

      <div className="deployment-grid">
        <SectionCard
          title="DeploymentSettings.json"
          description="Generated live from your current environment values and connection IDs."
          icon={<FileJson size={18} />}
          actions={<CopyButton text={settingsJson} onCopied={(ok) => onNotify(ok ? 'success' : 'error', ok ? 'Copied to clipboard' : 'Copy failed')} />}
          className="code-panel"
        >
          <div className="code-meta">
            <span className="file-name-pill">
              <FileJson size={13} /> {settingsFileName}
            </span>
            <span>{settingsJson.length.toLocaleString()} characters</span>
          </div>
          <pre className="json-preview" tabIndex={0}>
            <code>{settingsJson}</code>
          </pre>
          <div className="code-actions">
            <Button
              size="sm"
              variant="secondary"
              icon={<Download size={14} />}
              onClick={() => {
                downloadText(settingsJson, settingsFileName, 'application/json')
                onNotify('success', 'Deployment settings downloaded', settingsFileName)
              }}
            >
              Download
            </Button>
            <CopyButton text={settingsJson} onCopied={(ok) => onNotify(ok ? 'success' : 'error', ok ? 'Copied to clipboard' : 'Copy failed')} />
            {emptyConnections > 0 ? (
              <Button size="sm" variant="ghost" icon={<Cable size={14} />} onClick={onOpenConnections}>
                Fill {pluralize(emptyConnections, 'connection ID')}
              </Button>
            ) : null}
          </div>
        </SectionCard>

        <div className="deployment-side">
          <SectionCard
            title="Environment profiles"
            description="Save value mappings locally and reuse them across downloads."
            icon={<History size={18} />}
          >
            <div className="profile-form">
              <Field label="Profile name" htmlFor="profile-name">
                <input
                  id="profile-name"
                  className="text-input"
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  placeholder={`${ENV_PROFILES.find((item) => item.id === environment)?.label} profile`}
                />
              </Field>
              <Field label="Environment" htmlFor="profile-env">
                <select
                  id="profile-env"
                  className="select-input full"
                  value={environment}
                  onChange={(event) =>
                    setEnvironment(event.target.value as (typeof ENV_PROFILES)[number]['id'])
                  }
                >
                  {ENV_PROFILES.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Button variant="secondary" icon={<Save size={15} />} onClick={saveProfile}>
                Save current mapping
              </Button>
            </div>

            {profiles.length === 0 ? (
              <div className="profile-empty">
                <FolderOpen size={20} />
                <span>No saved profiles yet. Save one after filling in environment values and connection IDs.</span>
              </div>
            ) : (
              <div className="profile-list">
                {profiles.map((profile) => (
                  <div className="profile-row" key={profile.id}>
                    <span className={`profile-env-badge env-${profile.environment}`}>
                      {ENV_PROFILES.find((item) => item.id === profile.environment)?.label ?? profile.environment}
                    </span>
                    <div className="profile-copy">
                      <strong>{profile.name}</strong>
                      <span>
                        {Object.keys(profile.values).length} values ·{' '}
                        {Object.keys(profile.connectionIds).filter((key) => profile.connectionIds[key]).length}{' '}
                        connections · updated {formatTimeAgo(profile.updatedAt)}
                      </span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => onApplyProfile(profile)}>
                      Load
                    </Button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onDeleteProfile(profile.id)}
                      title="Delete profile"
                      aria-label={`Delete ${profile.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Deploy checklist"
            description="A reliable sequence for the target environment."
            icon={<ClipboardCheck size={18} />}
          >
            <ol className="deploy-steps">
              <li>
                <span>1</span>
                <div>
                  <strong>Download the rebuilt ZIP</strong>
                  <p>Apply version, environment values and dependency choices from this studio.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Download deployment settings</strong>
                  <p>Fill any remaining connection IDs, then keep this JSON with the ZIP.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Import with PAC CLI</strong>
                  <p>Use the settings file so environment values and connections resolve automatically.</p>
                </div>
              </li>
            </ol>
            <div className="cli-command">
              <code>
                pac solution import --path {pkg.solution.uniqueName.replace(/[^a-zA-Z0-9._-]/g, '_')}.zip
                --settings {settingsFileName}
              </code>
              <CopyButton
                text={`pac solution import --path ${pkg.solution.uniqueName.replace(/[^a-zA-Z0-9._-]/g, '_')}.zip --settings ${settingsFileName}`}
                label="Copy"
                onCopied={(ok) => onNotify(ok ? 'success' : 'error', ok ? 'Command copied' : 'Copy failed')}
              />
            </div>
          </SectionCard>
        </div>
      </div>

      {emptyConnections > 0 ? (
        <div className="notice notice-warning">
          <Cable size={19} />
          <div>
            <strong>{pluralize(emptyConnections, 'connection reference')} still missing a target ID.</strong>
            <p>
              <code>DeploymentSettings.json</code> will include empty ConnectionId values until you fill them.
              Import may fail in that state.
            </p>
          </div>
        </div>
      ) : (
        <div className="notice notice-success">
          <ShieldCheck size={19} />
          <div>
            <strong>Connection mappings look complete.</strong>
            <p>Every connection reference has a target connection ID for this deployment.</p>
          </div>
        </div>
      )}

      {secrets > 0 ? (
        <div className="notice notice-info">
          <Info size={19} />
          <div>
            <strong>{pluralize(secrets, 'secret variable')} in this solution.</strong>
            <p>
              Secret values cannot be exported from Power Apps. Supply them through the pipeline or set them
              manually after import.
            </p>
          </div>
        </div>
      ) : null}

      <div className="workflow-ribbon">
        <Rocket size={18} />
        <div>
          <strong>Ready to deploy?</strong>
          <span>
            Review the change set, download the ZIP, then pair it with{' '}
            <code>{settingsFileName}</code> during import.
          </span>
        </div>
        <ChevronRight size={16} />
      </div>
    </div>
  )
}
