import { useEffect, useMemo, useState } from 'react'
import {
  Cable,
  CheckCircle2,
  ExternalLink,
  FileJson,
  GitMerge,
  Info,
  Layers,
  Link2,
  Plug,
  Search,
  ShieldCheck,
  TriangleAlert,
  Workflow,
} from 'lucide-react'
import type { ConnectionReference, SolutionEdits, SolutionPackage } from '../types'
import { effectiveConnectionId } from '../lib/package'
import {
  analyzeConnectionUsage,
  connectorKey,
  groupConnectionReferences,
  type ConnectorGroup,
  type FlowUsage,
} from '../lib/connections'
import { cx, isUuidLike, truncateMiddle } from '../lib/format'
import { Badge, Button, CopyButton, EmptyState, SearchInput, SectionCard } from './ui'

export function ConnectionsTab({
  pkg,
  edits,
  onSetConnectionId,
  onSetConnectionIds,
  onOpenDeployment,
  onNotifyCopied,
}: {
  pkg: SolutionPackage
  edits: SolutionEdits
  onSetConnectionId: (logicalName: string, connectionId: string) => void
  onSetConnectionIds: (ids: Record<string, string>) => void
  onOpenDeployment: () => void
  onNotifyCopied: (copied: boolean) => void
}) {
  const [search, setSearch] = useState('')
  const [usageState, setUsageState] = useState<{
    pkg: SolutionPackage
    report: FlowUsage
  } | null>(null)
  const usage = usageState?.pkg === pkg ? usageState.report : null

  useEffect(() => {
    let cancelled = false
    analyzeConnectionUsage(pkg)
      .then((report) => {
        if (!cancelled) setUsageState({ pkg, report })
      })
      .catch(() => {
        // Usage detection is best-effort; the per-reference editor still works.
      })
    return () => {
      cancelled = true
    }
  }, [pkg])

  const configured = pkg.connectionReferences.filter((reference) =>
    effectiveConnectionId(edits, reference.logicalName).trim(),
  ).length

  const groups = useMemo(
    () => groupConnectionReferences(pkg.connectionReferences),
    [pkg.connectionReferences],
  )
  const duplicateGroups = groups.filter((group) => group.references.length > 1)
  const untracked = pkg.connectionReferences.filter(
    (reference) => !connectorKey(reference.connectorId),
  )

  const usageKnown = usage !== null && usage.flowFileCount > 0
  const unused = usageKnown
    ? pkg.connectionReferences.filter(
        (reference) => (usage.flows[reference.logicalName] ?? []).length === 0,
      )
    : []

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
            <div className="env-summary-item">
              <Layers size={17} />
              <span>
                <strong>{groups.length}</strong> connectors
              </span>
            </div>
            {duplicateGroups.length > 0 ? (
              <div className="env-summary-item">
                <GitMerge size={17} />
                <span>
                  <strong>{duplicateGroups.length}</strong> duplicate groups
                </span>
              </div>
            ) : null}
          </div>

          {groups.length > 0 ? (
            <SectionCard
              title="Consolidate by connector"
              description="Apply one shared connection ID to every reference that targets the same connector. This merges them at deployment time without touching flow definitions."
              icon={<GitMerge size={18} />}
            >
              <div className="connection-groups">
                {groups.map((group) => (
                  <ConnectorGroupCard
                    key={group.connectorKey}
                    group={group}
                    edits={edits}
                    usage={usage}
                    onApply={onSetConnectionIds}
                  />
                ))}
              </div>
              <p className="connection-caveat">
                <Info size={14} />
                <span>
                  Use a service-principal connection ID here to run every flow in the group under one identity.
                  Create that connection in each target environment first. Merging only works for references on
                  the same connector — similar-looking connectors such as Dataverse and its legacy variants are
                  not interchangeable.
                </span>
              </p>
            </SectionCard>
          ) : null}

          {usageKnown && unused.length > 0 ? (
            <SectionCard
              title="Possibly unused references"
              description="Not found in any cloud flow definition contained in this package."
              icon={<Workflow size={18} />}
            >
              <ul className="connection-unused-list">
                {unused.map((reference) => (
                  <li key={reference.logicalName}>
                    <span>
                      <strong>{reference.displayName}</strong>
                      <code>{reference.logicalName}</code>
                    </span>
                    <Badge tone="neutral">No flow usage</Badge>
                  </li>
                ))}
              </ul>
              <p className="connection-caveat">
                <Info size={14} />
                <span>
                  {usage.hasCanvasApps
                    ? 'This package also contains canvas apps, whose connection references cannot be inspected without unpacking the .msapp. Treat this list as a prompt, not a verdict.'
                    : 'A reference can still be used by components this scan does not cover, such as custom connectors or apps. Treat this list as a prompt, not a verdict.'}
                  {usage.skippedFiles > 0
                    ? ` ${usage.skippedFiles} workflow file${usage.skippedFiles === 1 ? '' : 's'} could not be scanned.`
                    : ''}
                </span>
              </p>
            </SectionCard>
          ) : null}

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
                    flowCount={usage ? usage.flows[reference.logicalName]?.length ?? 0 : null}
                    onChange={(value) => onSetConnectionId(reference.logicalName, value)}
                    onNotifyCopied={onNotifyCopied}
                  />
                ))}
              </div>
            )}
          </SectionCard>

          {untracked.length > 0 ? (
            <div className="info-footnote">
              <Info size={15} />
              <span>
                <strong>{untracked.length}</strong> reference{untracked.length === 1 ? '' : 's'} do not declare a
                connector ID, so they cannot be grouped automatically. Map them individually above.
              </span>
            </div>
          ) : null}
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

function ConnectorGroupCard({
  group,
  edits,
  usage,
  onApply,
}: {
  group: ConnectorGroup
  edits: SolutionEdits
  usage: FlowUsage | null
  onApply: (ids: Record<string, string>) => void
}) {
  const [sharedId, setSharedId] = useState('')
  const [applied, setApplied] = useState(false)

  const values = group.references.map((reference) =>
    effectiveConnectionId(edits, reference.logicalName).trim(),
  )
  const distinct = new Set(values.filter(Boolean))
  const configured = values.filter(Boolean).length
  const usedBy = usage
    ? group.references.filter(
        (reference) => (usage.flows[reference.logicalName] ?? []).length > 0,
      ).length
    : 0

  const apply = () => {
    const value = sharedId.trim()
    if (!value) return
    onApply(
      Object.fromEntries(
        group.references.map((reference) => [reference.logicalName, value]),
      ),
    )
    setApplied(true)
    setSharedId('')
  }

  return (
    <article className={cx('connection-group', group.references.length > 1 && 'is-duplicate')}>
      <header className="connection-group-head">
        <span className="connection-group-icon">
          <Layers size={16} />
        </span>
        <div className="connection-group-title">
          <strong>{group.connectorName}</strong>
          <code title={group.connectorId}>{group.connectorId || 'No connector id'}</code>
        </div>
        <div className="connection-group-badges">
          <Badge tone="neutral">
            {group.references.length} ref{group.references.length === 1 ? '' : 's'}
          </Badge>
          {distinct.size > 1 ? (
            <Badge tone="warning" dot>
              {distinct.size} IDs
            </Badge>
          ) : configured === group.references.length ? (
            <Badge tone="success" dot>
              Shared ID
            </Badge>
          ) : configured > 0 ? (
            <Badge tone="info" dot>
              Partly mapped
            </Badge>
          ) : null}
          {usage && usedBy > 0 ? (
            <Badge tone="neutral">
              {usedBy} used by flows
            </Badge>
          ) : null}
        </div>
      </header>

      <ul className="connection-group-refs">
        {group.references.map((reference) => {
          const flowCount = usage?.flows[reference.logicalName]?.length ?? 0
          return (
            <li key={reference.logicalName}>
              <span className="connection-group-ref-name">{reference.displayName}</span>
              <code className="cell-code">{reference.logicalName}</code>
              <span className="connection-group-ref-usage">
                {usage ? (
                  flowCount > 0 ? (
                    <span className="usage-count">
                      <Workflow size={12} /> {flowCount} flow{flowCount === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="usage-none">No flow usage</span>
                  )
                ) : (
                  <span className="usage-none">Scanning…</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="connection-group-map">
        <label htmlFor={`group-${group.connectorKey}`}>
          Shared connection ID for {group.references.length} reference
          {group.references.length === 1 ? '' : 's'}
        </label>
        <div className="connection-input-row">
          <input
            id={`group-${group.connectorKey}`}
            value={sharedId}
            onChange={(event) => {
              setSharedId(event.target.value)
              setApplied(false)
            }}
            placeholder="Service principal connection GUID"
            spellCheck={false}
            autoComplete="off"
            className="mono-input"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                apply()
              }
            }}
          />
          <Button
            size="sm"
            variant="primary"
            icon={<GitMerge size={14} />}
            disabled={!sharedId.trim()}
            onClick={apply}
          >
            Apply to all
          </Button>
        </div>
        <span className={cx('inline-hint', applied && 'success')}>
          {applied ? (
            <>
              <CheckCircle2 size={12} /> Applied to all {group.references.length} reference
              {group.references.length === 1 ? '' : 's'} in this group.
            </>
          ) : (
            <>
              <Info size={12} /> Uses the same connection for every flow in this group, including service
              principal connections. The solution ZIP itself is not modified.
            </>
          )}
        </span>
      </div>
    </article>
  )
}

function ConnectionCard({
  reference,
  value,
  flowCount,
  onChange,
  onNotifyCopied,
}: {
  reference: ConnectionReference
  value: string
  flowCount: number | null
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
              {flowCount !== null ? (
                <Badge
                  tone={flowCount > 0 ? 'info' : 'neutral'}
                  title={
                    flowCount > 0
                      ? `Referenced by ${flowCount} cloud flow definition${flowCount === 1 ? '' : 's'}`
                      : 'Not found in the cloud flow definitions in this package'
                  }
                >
                  <Workflow size={11} /> {flowCount > 0 ? `${flowCount} flow${flowCount === 1 ? '' : 's'}` : 'No flow usage'}
                </Badge>
              ) : null}
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
