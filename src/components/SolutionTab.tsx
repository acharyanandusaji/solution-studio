import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUp,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  Eraser,
  History,
  Link2Off,
  Package,
  PackageOpen,
  RotateCcw,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import type { SolutionEdits, SolutionPackage, VersionHistoryEntry } from '../types'
import { bumpVersion, componentTypeName, isValidVersion } from '../lib/xml'
import { formatTimeAgo, pluralize } from '../lib/format'
import { Badge, Button, EmptyState, SectionCard, Toggle } from './ui'

export function SolutionTab({
  pkg,
  edits,
  onChange,
  history,
  onUseHistoryVersion,
  onClearHistory,
}: {
  pkg: SolutionPackage
  edits: SolutionEdits
  onChange: (patch: Partial<SolutionEdits>) => void
  history: VersionHistoryEntry[]
  onUseHistoryVersion: (entry: VersionHistoryEntry) => void
  onClearHistory: () => void
}) {
  const parts = normalizeParts(edits.version)
  const versionValid = isValidVersion(edits.version)
  const versionChanged = edits.version !== pkg.solution.version

  const setPart = (index: number, raw: string) => {
    const next = [...parts]
    next[index] = raw.replace(/\D/g, '').slice(0, 5)
    onChange({ version: next.join('.') })
  }

  const bump = (index: 0 | 1 | 2 | 3) => {
    onChange({ version: bumpVersion(versionValid ? edits.version : pkg.solution.version, index) })
  }

  return (
    <div className="tab-stack">
      <div className="tab-heading">
        <div>
          <h1>Solution settings</h1>
          <p>Control the manifest metadata that ships inside the rebuilt ZIP.</p>
        </div>
        <Badge tone={versionChanged ? 'info' : 'neutral'} dot={versionChanged}>
          {versionChanged ? 'Modified' : 'Original values'}
        </Badge>
      </div>

      <SectionCard
        title="Solution version"
        description="Four numeric parts: major.minor.build.revision. Dataverse accepts values from 0 to 65535."
        icon={<Package size={18} />}
        actions={
          versionChanged ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} />}
              onClick={() => onChange({ version: pkg.solution.version })}
            >
              Reset to {pkg.solution.version}
            </Button>
          ) : null
        }
      >
        <div className={`version-editor ${!versionValid ? 'has-error' : ''}`}>
          <div className="version-parts">
            {parts.map((part, index) => {
              const value = Number(part)
              const outOfRange = part !== '' && value > 65535
              return (
                <div className="version-part-wrap" key={index}>
                  <label className="version-part-label" htmlFor={`version-part-${index}`}>
                    {['Major', 'Minor', 'Build', 'Revision'][index]}
                  </label>
                  <div className={`version-part ${outOfRange ? 'invalid' : ''}`}>
                    <input
                      id={`version-part-${index}`}
                      value={part}
                      onChange={(event) => setPart(index, event.target.value)}
                      inputMode="numeric"
                      placeholder="0"
                      aria-label={['Major version', 'Minor version', 'Build version', 'Revision version'][index]}
                    />
                    <button
                      type="button"
                      className="version-bump"
                      onClick={() => bump(index as 0 | 1 | 2 | 3)}
                      title={`Increment ${['major', 'minor', 'build', 'revision'][index]} version`}
                      aria-label={`Increment ${['major', 'minor', 'build', 'revision'][index]} version`}
                    >
                      <ArrowUp size={13} />
                    </button>
                  </div>
                  {outOfRange ? <span className="version-part-error">Max 65535</span> : null}
                </div>
              )
            })}
          </div>
          <div className="version-preview">
            <span>Target version</span>
            <code className={versionValid ? undefined : 'invalid'}>{edits.version || '—'}</code>
            {versionChanged && versionValid ? (
              <Badge tone="info">
                {pkg.solution.version} <ChevronRight size={11} /> {edits.version}
              </Badge>
            ) : null}
          </div>
          {!versionValid ? (
            <p className="inline-error">
              <AlertTriangle size={14} /> Enter four numeric parts separated by dots. Leaving a part empty is not
              valid.
            </p>
          ) : null}
        </div>

        <div className="version-quick-row">
          <span className="quick-label">
            <Wand2 size={14} /> Quick bump
          </span>
          <button className="chip-action" type="button" onClick={() => bump(0)}>
            Major → {nextLabel(edits.version, 0)}
          </button>
          <button className="chip-action" type="button" onClick={() => bump(1)}>
            Minor → {nextLabel(edits.version, 1)}
          </button>
          <button className="chip-action" type="button" onClick={() => bump(2)}>
            Build → {nextLabel(edits.version, 2)}
          </button>
          <button className="chip-action" type="button" onClick={() => bump(3)}>
            Revision → {nextLabel(edits.version, 3)}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Package state"
        description="Choose how the solution should be marked in its manifest."
        icon={<Shield size={18} />}
      >
        <div className="option-cards">
          <button
            type="button"
            className={`option-card ${!edits.managed ? 'is-selected' : ''}`}
            onClick={() => onChange({ managed: false })}
          >
            <div className="option-card-head">
              <span className="option-icon option-icon-green">
                <PackageOpen size={20} />
              </span>
              <span className={`radio-dot ${!edits.managed ? 'is-on' : ''}`} />
            </div>
            <strong>Unmanaged</strong>
            <p>For development environments. Makers can customize every component after import.</p>
            <div className="option-tags">
              <Badge tone="success">Recommended for editing</Badge>
              {!pkg.solution.managed ? <Badge tone="neutral">Original</Badge> : null}
            </div>
          </button>

          <button
            type="button"
            className={`option-card ${edits.managed ? 'is-selected' : ''}`}
            onClick={() => onChange({ managed: true })}
          >
            <div className="option-card-head">
              <span className="option-icon option-icon-violet">
                <Shield size={20} />
              </span>
              <span className={`radio-dot ${edits.managed ? 'is-on' : ''}`} />
            </div>
            <strong>Managed</strong>
            <p>For test and production. Components are locked, but this flag alone does not lock them.</p>
            <div className="option-tags">
              <Badge tone="violet">Locked intent</Badge>
              {pkg.solution.managed ? <Badge tone="neutral">Original</Badge> : null}
            </div>
          </button>
        </div>

        <div className="notice notice-warning">
          <ShieldAlert size={19} />
          <div>
            <strong>This is a manifest flag, not a real conversion.</strong>
            <p>
              Flipping <code>&lt;Managed&gt;</code> in <code>solution.xml</code> changes the packaging metadata
              only. A genuine managed solution must be exported as managed from Dataverse, or imported and
              re-exported. Keep this in mind before importing the downloaded ZIP.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Missing dependencies"
        description="Review unresolved component dependencies and decide whether to clear the list."
        icon={<Link2Off size={18} />}
        actions={
          <Toggle
            checked={edits.removeMissingDependencies}
            onChange={(next) => onChange({ removeMissingDependencies: next })}
            label="Clear on download"
            disabled={!pkg.solution.hasMissingDependenciesNode}
            danger
          />
        }
      >
        {pkg.solution.missingDependencies.length === 0 ? (
          <div className="clean-state clean-state-inline">
            <div className="clean-icon">
              <CircleCheck size={20} />
            </div>
            <div>
              <strong>No missing dependencies found</strong>
              <p>
                {pkg.solution.hasMissingDependenciesNode
                  ? 'The MissingDependencies element exists but is empty — nothing to clear.'
                  : 'This solution manifest has no MissingDependencies element.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {edits.removeMissingDependencies ? (
              <div className="notice notice-danger">
                <Eraser size={19} />
                <div>
                  <strong>{pluralize(pkg.solution.missingDependencies.length, 'dependency', 'dependencies')} will be cleared.</strong>
                  <p>
                    The list is emptied to <code>&lt;MissingDependencies /&gt;</code> and the element is kept.
                    Make sure the target environment already contains the required components — clearing the
                    list hides the warning, it does not install what is missing.
                  </p>
                </div>
              </div>
            ) : (
              <div className="notice notice-warning">
                <AlertTriangle size={19} />
                <div>
                  <strong>
                    {pluralize(pkg.solution.missingDependencies.length, 'dependency', 'dependencies')} still
                    unresolved.
                  </strong>
                  <p>
                    The import usually fails or warns in the target environment. Toggle “Remove on download” if
                    you have confirmed those components exist there.
                  </p>
                </div>
              </div>
            )}

            <div className="table-wrap">
              <table className="data-table dependency-table">
                <thead>
                  <tr>
                    <th>Required component</th>
                    <th>Type</th>
                    <th>Needed by</th>
                    <th>Parent</th>
                  </tr>
                </thead>
                <tbody>
                  {pkg.solution.missingDependencies.map((dependency) => (
                    <tr key={dependency.id}>
                      <td>
                        <div className="cell-primary">
                          {dependency.required.displayName || dependency.required.schemaName || 'Unknown'}
                        </div>
                        {dependency.required.schemaName ? (
                          <code className="cell-code">{dependency.required.schemaName}</code>
                        ) : null}
                      </td>
                      <td>
                        <Badge tone="warning">
                          {dependency.required.typeName ||
                            componentTypeName(dependency.required.type)}
                        </Badge>
                      </td>
                      <td>
                        <div className="cell-primary">
                          {dependency.dependency.displayName ||
                            dependency.dependency.schemaName ||
                            'Unknown component'}
                        </div>
                        {dependency.dependency.schemaName ? (
                          <code className="cell-code">{dependency.dependency.schemaName}</code>
                        ) : null}
                      </td>
                      <td>
                        {dependency.dependency.parentSchemaName ? (
                          <code className="cell-code">{dependency.dependency.parentSchemaName}</code>
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard
        title="Version history"
        description="Downloads completed in this browser, stored locally for quick reference."
        icon={<History size={18} />}
        actions={
          history.length > 0 ? (
            <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={onClearHistory}>
              Clear history
            </Button>
          ) : null
        }
      >
        {history.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={22} />}
            title="No downloads yet"
            description="After your first rebuilt ZIP is downloaded, its version and change summary will appear here."
          />
        ) : (
          <div className="history-list">
            {history.slice(0, 8).map((entry) => (
              <div className="history-row" key={entry.id}>
                <span className="history-icon">
                  <ArrowDownToLine size={16} />
                </span>
                <div className="history-main">
                  <div className="history-title">
                    <code>v{entry.version}</code>
                    {entry.version === edits.version ? <Badge tone="info">Current target</Badge> : null}
                    {entry.managed ? <Badge tone="violet">Managed</Badge> : <Badge tone="success">Unmanaged</Badge>}
                  </div>
                  <span className="history-meta">
                    {formatTimeAgo(entry.timestamp)} · {entry.fileName}
                    {entry.envVarChanges > 0
                      ? ` · ${entry.envVarChanges} env override${entry.envVarChanges === 1 ? '' : 's'}`
                      : ''}
                    {entry.missingDependenciesRemoved ? ' · dependencies removed' : ''}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={14} />}
                  onClick={() => onUseHistoryVersion(entry)}
                  disabled={!isValidVersion(entry.version)}
                >
                  Use
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="info-footnote">
        <Sparkles size={15} />
        <span>
          Structured edits are applied to the original XML only when you build the ZIP. The uploaded file on
          disk stays untouched.
        </span>
      </div>
    </div>
  )
}

function normalizeParts(version: string): string[] {
  const parts = version.split('.')
  const result = [...parts.slice(0, 4)]
  while (result.length < 4) result.push('')
  return result
}

function nextLabel(version: string, index: 0 | 1 | 2 | 3): string {
  if (!isValidVersion(version)) return '—'
  return bumpVersion(version, index)
}
