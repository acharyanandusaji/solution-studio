import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Braces,
  Check,
  Database,
  Eye,
  EyeOff,
  FileJson,
  Hash,
  KeyRound,
  RotateCcw,
  ToggleLeft,
  Type,
  Variable,
  Wand2,
} from 'lucide-react'
import type { EnvironmentVariable, SolutionEdits, SolutionPackage } from '../types'
import { effectiveEnvironmentValue } from '../lib/package'
import { cx } from '../lib/format'
import { Badge, Button, EmptyState, SearchInput, SectionCard } from './ui'

const TYPE_TONES: Record<number, 'cyan' | 'info' | 'success' | 'violet' | 'warning' | 'danger' | 'neutral'> = {
  100000000: 'cyan',
  100000001: 'info',
  100000002: 'success',
  100000003: 'violet',
  100000004: 'warning',
  100000005: 'danger',
}

export function EnvironmentTab({
  pkg,
  edits,
  onSetValue,
  onRevertValue,
  onRevertAll,
  onOpenDeployment,
}: {
  pkg: SolutionPackage
  edits: SolutionEdits
  onSetValue: (schemaName: string, value: string) => void
  onRevertValue: (schemaName: string) => void
  onRevertAll: () => void
  onOpenDeployment: () => void
}) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [modifiedOnly, setModifiedOnly] = useState(false)

  const modifiedCount = pkg.environmentVariables.filter((variable) =>
    Object.prototype.hasOwnProperty.call(edits.envVarValues, variable.schemaName),
  ).length

  const availableTypes = useMemo(
    () => Array.from(new Set(pkg.environmentVariables.map((variable) => variable.type))).sort(),
    [pkg.environmentVariables],
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return pkg.environmentVariables.filter((variable) => {
      if (typeFilter !== 'all' && String(variable.type) !== typeFilter) return false
      if (
        modifiedOnly &&
        !Object.prototype.hasOwnProperty.call(edits.envVarValues, variable.schemaName)
      ) {
        return false
      }
      if (!query) return true
      return (
        variable.schemaName.toLowerCase().includes(query) ||
        variable.displayName.toLowerCase().includes(query) ||
        variable.description?.toLowerCase().includes(query)
      )
    })
  }, [pkg.environmentVariables, search, typeFilter, modifiedOnly, edits.envVarValues])

  const secrets = pkg.environmentVariables.filter((variable) => variable.secret).length
  const emptyCount = pkg.environmentVariables.filter(
    (variable) =>
      !variable.secret &&
      effectiveEnvironmentValue(pkg, edits, variable.schemaName).trim() === '',
  ).length

  return (
    <div className="tab-stack">
      <div className="tab-heading">
        <div>
          <h1>Environment variables</h1>
          <p>
            Definitions are read from <code>customizations.xml</code> or from{' '}
            <code>environmentvariabledefinitions/</code> sidecar files, including managed
            exports. Values are written back into the ZIP when you download.
          </p>
        </div>
        <div className="heading-actions">
          <Button variant="ghost" size="sm" icon={<FileJson size={15} />} onClick={onOpenDeployment}>
            Deployment settings
          </Button>
          {modifiedCount > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw size={14} />}
              onClick={onRevertAll}
            >
              Reset {modifiedCount} change{modifiedCount === 1 ? '' : 's'}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="env-summary">
        <div className="env-summary-item">
          <Variable size={17} />
          <span>
            <strong>{pkg.environmentVariables.length}</strong> definitions
          </span>
        </div>
        <div className="env-summary-item">
          <Wand2 size={17} />
          <span>
            <strong>{modifiedCount}</strong> edited
          </span>
        </div>
        <div className="env-summary-item">
          <AlertTriangle size={17} />
          <span>
            <strong>{emptyCount}</strong> empty
          </span>
        </div>
        <div className="env-summary-item">
          <KeyRound size={17} />
          <span>
            <strong>{secrets}</strong> secret
          </span>
        </div>
      </div>

      {pkg.environmentVariables.length === 0 ? (
        <SectionCard
          title="No environment variables"
          description="This package does not expose environment variable definitions."
          icon={<Variable size={18} />}
        >
          <EmptyState
            icon={<Variable size={24} />}
            title="Nothing to configure"
            description="Environment variable definitions live in customizations.xml or environmentvariabledefinitions/ sidecar files. This solution does not contain any."
          />
        </SectionCard>
      ) : (
        <SectionCard
          title="Variable values"
          description="Edit the value that will be imported with the solution. Unchanged rows keep their original value or default."
          icon={<Variable size={18} />}
          bodyClassName="no-pad"
        >
          <div className="table-toolbar">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by schema name or display name…"
              ariaLabel="Search environment variables"
            />
            <div className="toolbar-controls">
              <select
                className="select-input"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                aria-label="Filter by variable type"
              >
                <option value="all">All types</option>
                {availableTypes.map((type) => (
                  <option value={String(type)} key={type}>
                    {pkg.environmentVariables.find((variable) => variable.type === type)?.typeName ??
                      `Type ${type}`}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={cx('filter-chip', modifiedOnly && 'is-active')}
                onClick={() => setModifiedOnly((current) => !current)}
              >
                <Check size={13} /> Edited only
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Variable size={22} />}
              title="No variables match"
              description="Try clearing the search or type filter."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setSearch('')
                    setTypeFilter('all')
                    setModifiedOnly(false)
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table env-table">
                <thead>
                  <tr>
                    <th>Variable</th>
                    <th>Type</th>
                    <th>Current value</th>
                    <th>Default</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((variable) => {
                    const modified = Object.prototype.hasOwnProperty.call(
                      edits.envVarValues,
                      variable.schemaName,
                    )
                    const value = effectiveEnvironmentValue(pkg, edits, variable.schemaName)
                    return (
                      <tr key={variable.schemaName} className={modified ? 'row-modified' : undefined}>
                        <td>
                          <div className="variable-cell">
                            <div className="cell-primary">
                              {variable.displayName}
                              {variable.secret ? <Badge tone="danger">Secret</Badge> : null}
                              {modified ? <Badge tone="info">Edited</Badge> : null}
                            </div>
                            <code className="cell-code">{variable.schemaName}</code>
                            {variable.description ? (
                              <p className="cell-description" title={variable.description}>
                                {variable.description}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <Badge tone={TYPE_TONES[variable.type] ?? 'neutral'}>{variable.typeName}</Badge>
                          <div className="cell-subtle">
                            {variable.explicitValue ? 'Explicit value' : 'Inherited default'}
                          </div>
                        </td>
                        <td className="value-cell">
                          <ValueEditor
                            variable={variable}
                            value={value}
                            modified={modified}
                            onChange={(next) => onSetValue(variable.schemaName, next)}
                          />
                        </td>
                        <td className="default-cell">
                          {variable.defaultValue ? (
                            <code className="default-code" title={variable.defaultValue}>
                              {variable.defaultValue}
                            </code>
                          ) : (
                            <span className="cell-muted">No default</span>
                          )}
                        </td>
                        <td className="row-actions-cell">
                          {modified ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<RotateCcw size={13} />}
                              onClick={() => onRevertValue(variable.schemaName)}
                            >
                              Revert
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <div className="info-footnote">
        <AlertTriangle size={15} />
        <span>
          Secret variables cannot be exported with values. Set them in the target environment or supply them
          through your deployment pipeline. Environment-specific values can also live in{' '}
          <code>DeploymentSettings.json</code> instead of the ZIP.
        </span>
      </div>
    </div>
  )
}

function ValueEditor({
  variable,
  value,
  modified,
  onChange,
}: {
  variable: EnvironmentVariable
  value: string
  modified: boolean
  onChange: (value: string) => void
}) {
  const [reveal, setReveal] = useState(false)
  const id = `env-${variable.schemaName}`

  if (variable.type === 100000002) {
    const options = ['true', 'false']
    if (value && !options.includes(value.toLowerCase())) options.push(value)
    return (
      <div className="boolean-editor">
        <select
          id={id}
          className={cx('select-input', modified && 'is-modified')}
          value={value.toLowerCase()}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Not set</option>
          {options.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
        {value ? (
          <span className={cx('inline-type-icon', value.toLowerCase() === 'true' ? 'is-on' : 'is-off')}>
            <ToggleLeft size={16} />
          </span>
        ) : null}
      </div>
    )
  }

  if (variable.type === 100000003) {
    return (
      <div className={cx('json-editor', modified && 'is-modified')}>
        <span className="json-editor-icon">
          <Braces size={15} />
        </span>
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          spellCheck={false}
          placeholder='{ "feature": true }'
          aria-label={`${variable.displayName} JSON value`}
        />
      </div>
    )
  }

  if (variable.secret) {
    return (
      <div className={cx('secret-editor', modified && 'is-modified')}>
        <input
          id={id}
          type={reveal ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Set a secret value or leave blank"
          autoComplete="off"
          aria-label={`${variable.displayName} secret value`}
        />
        <button
          type="button"
          className="input-adornment"
          onClick={() => setReveal((current) => !current)}
          aria-label={reveal ? 'Hide value' : 'Show value'}
          title={reveal ? 'Hide value' : 'Show value'}
        >
          {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    )
  }

  const Icon =
    variable.type === 100000001 ? Hash : variable.type === 100000004 ? Database : Type

  return (
    <div className={cx('value-input', modified && 'is-modified')}>
      <span className="value-icon">
        <Icon size={14} />
      </span>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={variable.type === 100000001 ? 'decimal' : 'text'}
        placeholder={
          variable.type === 100000004 ? '/sites/contoso/Shared Documents' : 'Enter a value'
        }
        aria-label={`${variable.displayName} value`}
      />
    </div>
  )
}
