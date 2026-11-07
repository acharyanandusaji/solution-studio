import { useMemo, useState } from 'react'
import {
  Cable,
  CheckCircle2,
  ExternalLink,
  FileJson,
  Info,
  Link2,
  Plug,
  Search,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import type { ConnectionReference, SolutionEdits, SolutionPackage } from '../types'
import { effectiveConnectionId } from '../lib/package'
import { isUuidLike, truncateMiddle } from '../lib/format'
import { Badge, Button, CopyButton, EmptyState, SearchInput, SectionCard } from './ui'

export function ConnectionsTab({
  pkg,
  edits,
  onSetConnectionId,
  onOpenDeployment,
  onNotifyCopied,
}: {
  pkg: SolutionPackage
  edits: SolutionEdits
  onSetConnectionId: (logicalName: string, connectionId: string) => void
  onOpenDeployment: () => void
  onNotifyCopied: (copied: boolean) => void
}) {
  const [search, setSearch] = useState('')

  const configured = pkg.connectionReferences.filter((reference) =>
    effectiveConnectionId(edits, reference.logicalName).trim(),
  ).length

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return pkg.connectionReferences
    return pkg.connectionReferences.filter(
      (reference) =>
        reference.logicalName.toLowerCase().includes(query) ||
        reference.displayName.toLowerCase().includes(query) ||
        reference.connectorId.toLowerCase().includes(query),
    )
  }, [pkg.connectionReferences, search])

  return (
    <div className="tab-stack">
      <div className="tab-heading">
        <div>
          <h1>Connection references</h1>
          <p>
            Map solution connection references to target environment connections. These IDs are exported to{' '}
            <code>DeploymentSettings.json</code>, not written into the ZIP.
          </p>
        </div>
        <div className="heading-actions">
          <Button variant="secondary" size="sm" icon={<FileJson size={15} />} onClick={onOpenDeployment}>
            Open deployment settings
          </Button>
        </div>
      </div>

      <div className="notice notice-info">
        <ShieldCheck size={19} />
        <div>
          <strong>Connection IDs are environment-specific and should never travel inside a solution ZIP.</strong>
          <p>
            The solution only stores the logical reference and connector. Fill in the connection ID for the
            environment you are deploying to, then download the generated deployment settings alongside your
            rebuilt solution.
          </p>
        </div>
      </div>

      {pkg.connectionReferences.length === 0 ? (
        <SectionCard
          title="No connection references"
          description="This solution does not contain connection references."
          icon={<Cable size={18} />}
        >
          <EmptyState
            icon={<Plug size={24} />}
            title="No connections to configure"
            description="Connection references are created when a cloud flow, canvas app or custom connector uses a connector."
          />
        </SectionCard>
      ) : (
        <>
          <div className="env-summary">
            <div className="env-summary-item">
              <Cable size={17} />
              <span>
                <strong>{pkg.connectionReferences.length}</strong> references
              </span>
            </div>
            <div className="env-summary-item">
              <CheckCircle2 size={17} />
              <span>
                <strong>{configured}</strong> configured
              </span>
            </div>
            <div className="env-summary-item">
              <TriangleAlert size={17} />
              <span>
                <strong>{pkg.connectionReferences.length - configured}</strong> missing IDs
              </span>
            </div>
          </div>

          <SectionCard
            title="Target connections"
            description="Paste the connection GUID from the target environment for each reference."
            icon={<Link2 size={18} />}
            actions={
              pkg.connectionReferences.length > 4 ? (
                <div className="compact-search">
                  <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Filter references…"
                    ariaLabel="Filter connection references"
                  />
                </div>
              ) : null
            }
          >
            {filtered.length === 0 ? (
              <EmptyState
                icon={<Search size={22} />}
                title="No matching references"
                description="Try a different logical name or connector."
                action={<Button size="sm" onClick={() => setSearch('')}>Clear search</Button>}
              />
            ) : (
              <div className="connection-list">
                {filtered.map((reference) => (
                  <ConnectionCard
                    key={reference.logicalName}
                    reference={reference}
                    value={effectiveConnectionId(edits, reference.logicalName)}
                    onChange={(value) => onSetConnectionId(reference.logicalName, value)}
                    onNotifyCopied={onNotifyCopied}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}

      <div className="info-footnote">
        <Info size={15} />
        <span>
          To find a connection ID, open <strong>make.powerapps.com → Connections</strong>, select the target
          connection and copy the GUID from the URL. Each environment has its own connection IDs.
        </span>
      </div>
    </div>
  )
}

function ConnectionCard({
  reference,
  value,
  onChange,
  onNotifyCopied,
}: {
  reference: ConnectionReference
  value: string
  onChange: (value: string) => void
  onNotifyCopied: (copied: boolean) => void
}) {
  const configured = value.trim().length > 0
  const looksValid = configured && isUuidLike(value)
  return (
    <article className={`connection-card ${configured ? 'is-configured' : ''}`}>
      <div className="connection-card-head">
        <div className="connection-identity">
          <span className="connection-icon">
            <Plug size={18} />
          </span>
          <div>
            <div className="connection-title">
              <strong>{reference.displayName}</strong>
              {configured ? (
                <Badge tone="success" dot>
                  Configured
                </Badge>
              ) : (
                <Badge tone="warning" dot>
                  Needs connection
                </Badge>
              )}
              {reference.connectionId ? <Badge tone="neutral">Original: {truncateMiddle(reference.connectionId, 18)}</Badge> : null}
            </div>
            <code className="cell-code">{reference.logicalName}</code>
          </div>
        </div>
        <a
          className="connection-link"
          href="https://make.powerapps.com"
          target="_blank"
          rel="noreferrer noopener"
          title="Open Power Apps in a new tab"
        >
          <ExternalLink size={14} /> Power Apps
        </a>
      </div>

      <div className="connection-field">
        <label htmlFor={`connection-${reference.logicalName}`}>Connection ID</label>
        <div className={`connection-input-row ${value && !looksValid ? 'has-warning' : ''}`}>
          <input
            id={`connection-${reference.logicalName}`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            spellCheck={false}
            autoComplete="off"
            className="mono-input"
          />
          <CopyButton
            text={value}
            label="Copy"
            size="sm"
            onCopied={onNotifyCopied}
          />
        </div>
        {value && !looksValid ? (
          <span className="inline-hint warning">
            <TriangleAlert size={12} /> This does not look like a connection GUID. Double-check the value.
          </span>
        ) : (
          <span className="inline-hint">The connection GUID from the target environment.</span>
        )}
      </div>

      <div className="connector-row">
        <span>Connector</span>
        <code title={reference.connectorId}>{reference.connectorId || 'Not specified'}</code>
        {reference.connectorId ? (
          <CopyButton
            text={reference.connectorId}
            label="Copy connector"
            size="sm"
            onCopied={onNotifyCopied}
          />
        ) : null}
      </div>
      {reference.description ? <p className="connection-description">{reference.description}</p> : null}
    </article>
  )
}
