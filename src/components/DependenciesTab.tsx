import { useMemo } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Eraser,
  Layers,
  Link2Off,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react'
import type { SolutionEdits, SolutionPackage } from '../types'
import { pluralize } from '../lib/format'
import { Badge, Button, EmptyState, SectionCard, Toggle } from './ui'

export function DependenciesTab({
  pkg,
  edits,
  onChange,
}: {
  pkg: SolutionPackage
  edits: SolutionEdits
  onChange: (patch: Partial<SolutionEdits>) => void
}) {
  const dependencies = pkg.solution.missingDependencies
  const uniqueRequired = useMemo(
    () => new Set(dependencies.map((dependency) => dependency.required.schemaName || dependency.id)).size,
    [dependencies],
  )
  const uniqueTypes = useMemo(
    () => Array.from(new Set(dependencies.map((dependency) => dependency.required.typeName))),
    [dependencies],
  )

  return (
    <div className="tab-stack">
      <div className="tab-heading">
        <div>
          <h1>Dependency analysis</h1>
          <p>
            Understand what the solution expects from its target environment before importing it.
          </p>
        </div>
        {dependencies.length > 0 ? (
          <Toggle
            checked={edits.removeMissingDependencies}
            onChange={(next) => onChange({ removeMissingDependencies: next })}
            label="Remove on download"
            danger
          />
        ) : null}
      </div>

      {dependencies.length === 0 ? (
        <SectionCard
          title="Dependency status"
          description="Parsed from the MissingDependencies element in solution.xml."
          icon={<Link2Off size={18} />}
        >
          <EmptyState
            icon={<CheckCircle2 size={26} />}
            title="No missing dependencies"
            description={
              pkg.solution.hasMissingDependenciesNode
                ? 'The MissingDependencies block is present in solution.xml but contains no entries.'
                : 'solution.xml does not contain a MissingDependencies block.'
            }
          />
        </SectionCard>
      ) : (
        <>
          {edits.removeMissingDependencies ? (
            <div className="notice notice-danger">
              <Eraser size={19} />
              <div>
                <strong>Removal is enabled for the next download.</strong>
                <p>
                  The entire MissingDependencies element will be deleted from solution.xml. Only do this when
                  every required component is already installed in the target environment.
                </p>
              </div>
            </div>
          ) : (
            <div className="notice notice-warning">
              <TriangleAlert size={19} />
              <div>
                <strong>
                  {pluralize(dependencies.length, 'missing dependency', 'missing dependencies')} detected.
                </strong>
                <p>
                  Importing with unresolved dependencies can fail or produce warnings. Review each requirement
                  below or remove the block if you know the target environment already satisfies them.
                </p>
              </div>
            </div>
          )}

          <div className="stat-grid dep-stat-grid">
            <div className="stat-card">
              <div className="stat-icon stat-icon-warning">
                <Link2Off size={19} />
              </div>
              <div className="stat-copy">
                <span className="stat-label">Missing entries</span>
                <strong className="stat-value">{dependencies.length}</strong>
                <span className="stat-hint">Rows in MissingDependencies</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-cyan">
                <Layers size={19} />
              </div>
              <div className="stat-copy">
                <span className="stat-label">Unique required</span>
                <strong className="stat-value">{uniqueRequired}</strong>
                <span className="stat-hint">Components to verify</span>
              </div>
            </div>
            <div className="stat-card dep-types-card">
              <div className="stat-icon stat-icon-violet">
                <ShieldAlert size={19} />
              </div>
              <div className="stat-copy">
                <span className="stat-label">Component types</span>
                <div className="type-chip-row">
                  {uniqueTypes.map((type) => (
                    <Badge tone="warning" key={type}>
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <SectionCard
            title="Dependency details"
            description="Required component on the left, the referencing component on the right."
            icon={<Link2Off size={18} />}
            actions={
              <Badge tone={edits.removeMissingDependencies ? 'danger' : 'warning'} dot>
                {edits.removeMissingDependencies ? 'Will be removed' : 'Will be preserved'}
              </Badge>
            }
          >
            <div className="dependency-cards">
              {dependencies.map((dependency) => (
                <article className="dependency-card" key={dependency.id}>
                  <div className="dependency-card-main">
                    <div className="dependency-block">
                      <span className="dependency-label">Required in target environment</span>
                      <strong>{dependency.required.displayName || dependency.required.schemaName || 'Unknown'}</strong>
                      <div className="dependency-meta">
                        <Badge tone="warning">{dependency.required.typeName}</Badge>
                        {dependency.required.schemaName ? (
                          <code>{dependency.required.schemaName}</code>
                        ) : null}
                      </div>
                      {dependency.required.parentSchemaName ? (
                        <span className="dependency-parent">
                          Parent: <code>{dependency.required.parentSchemaName}</code>
                        </span>
                      ) : null}
                    </div>
                    <ArrowRight size={18} className="dependency-arrow" />
                    <div className="dependency-block">
                      <span className="dependency-label">Needed by solution component</span>
                      <strong>
                        {dependency.dependency.displayName ||
                          dependency.dependency.schemaName ||
                          'Unknown component'}
                      </strong>
                      <div className="dependency-meta">
                        <Badge tone="neutral">{dependency.dependency.typeName}</Badge>
                        {dependency.dependency.schemaName ? (
                          <code>{dependency.dependency.schemaName}</code>
                        ) : null}
                      </div>
                      {dependency.dependency.parentSchemaName ? (
                        <span className="dependency-parent">
                          Parent: <code>{dependency.dependency.parentSchemaName}</code>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>

          <div className="overview-columns">
            <SectionCard
              title="What removal actually does"
              description="A precise description of the ZIP edit."
              icon={<CircleHelp size={18} />}
            >
              <ul className="explain-list">
                <li>
                  <strong>It removes metadata, not dependencies.</strong> The components still need to exist in
                  the target environment.
                </li>
                <li>
                  <strong>It prevents the importer from blocking on the missing list.</strong> This is commonly
                  used when the dependency is installed manually or by another solution first.
                </li>
                <li>
                  <strong>The original ZIP is untouched.</strong> Only the downloaded copy differs, and you can
                  keep a backup.
                </li>
              </ul>
            </SectionCard>
            <SectionCard
              title="Recommended checks"
              description="Before enabling removal, confirm these in the target environment."
              icon={<CheckCircle2 size={18} />}
            >
              <ul className="check-list">
                <li>Required tables and columns are already installed.</li>
                <li>Connection references point to working target connections.</li>
                <li>Any OOB solution dependency has the same or newer version.</li>
                <li>You have a rollback plan or backup of the target environment.</li>
              </ul>
              <div className="notice notice-info compact-notice">
                <span>
                  Tip: after import, check the solution’s dependency page in Power Apps to confirm every
                  component resolved.
                </span>
              </div>
            </SectionCard>
          </div>
        </>
      )}

      <div className="info-footnote">
        <Button variant="ghost" size="sm" onClick={() => onChange({ removeMissingDependencies: false })} disabled={!edits.removeMissingDependencies}>
          Keep MissingDependencies instead
        </Button>
        <span>The toggle is reversible until you download the rebuilt ZIP.</span>
      </div>
    </div>
  )
}
