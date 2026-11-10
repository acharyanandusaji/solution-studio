import type { ReactNode } from 'react'
import {
  ArrowRight,
  Box,
  Cable,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDot,
  FileArchive,
  FileJson,
  FolderArchive,
  Gauge,
  GitCompareArrows,
  Info,
  Link2Off,
  Package,
  Plus,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Variable,
} from 'lucide-react'
import type {
  ChangeItem,
  HealthReport,
  SolutionEdits,
  SolutionPackage,
  TabId,
} from '../types'
import { formatBytes, formatDate, pluralize } from '../lib/format'
import { effectiveConnectionReferences } from '../lib/package'
import { Badge, Button, Card, ScoreRing, SectionCard, StatCard, StatusIcon } from './ui'

export function OverviewTab({
  pkg,
  edits,
  health,
  changes,
  onTab,
  onBumpBuild,
}: {
  pkg: SolutionPackage
  edits: SolutionEdits
  health: HealthReport
  changes: ChangeItem[]
  onTab: (tab: TabId) => void
  onBumpBuild: () => void
}) {
  const modifiedEnvVars = Object.keys(edits.envVarValues).length
  const effectiveConnections = effectiveConnectionReferences(pkg, edits)
  const mergedConnectionCount = pkg.connectionReferences.length - effectiveConnections.length
  const configuredConnections = effectiveConnections.filter((reference) =>
    (edits.connectionIds[reference.logicalName] ?? '').trim(),
  ).length
  const componentCount = pkg.solution.rootComponents.length
  const missingCount = edits.removeMissingDependencies ? 0 : pkg.solution.missingDependencies.length

  return (
    <div className="tab-stack">
      <Card className="overview-hero">
        <div className="overview-hero-main">
          <div className="overview-solution-icon">
            <Package size={30} />
          </div>
          <div className="overview-hero-copy">
            <div className="overview-eyebrow">
              <span className="status-live" /> Solution package loaded
            </div>
            <h1>{pkg.solution.displayName}</h1>
            <p className="overview-unique-name">{pkg.solution.uniqueName}</p>
            {pkg.solution.description ? (
              <p className="overview-description">{pkg.solution.description}</p>
            ) : null}
            <div className="overview-meta-row">
              <Badge tone="neutral">
                <Shield size={12} /> {pkg.solution.publisher.displayName}
              </Badge>
              <Badge tone="info">Language {pkg.solution.languageCode}</Badge>
              <Badge tone="neutral">
                <FileArchive size={12} /> {formatBytes(pkg.fileSize)}
              </Badge>
              <Badge tone={pkg.solution.managed ? 'violet' : 'success'} dot>
                {pkg.solution.managed ? 'Managed package' : 'Unmanaged package'}
              </Badge>
            </div>
          </div>
        </div>
        <div className="overview-health">
          <ScoreRing score={health.score} />
          <div className="overview-health-copy">
            <span>Pre-import health</span>
            <strong>
              {health.failed > 0
                ? 'Fix blockers first'
                : health.warnings > 0
                  ? 'Review recommended'
                  : 'Looking good'}
            </strong>
            <p>
              {health.passed} passed · {health.warnings} warnings · {health.failed} failed
            </p>
          </div>
        </div>
      </Card>

      <div className="stat-grid">
        <StatCard
          label="Root components"
          value={componentCount}
          hint={componentCount > 0 ? 'Tables, apps, flows & more' : 'No root components discovered'}
          icon={<Box size={19} />}
          tone="cyan"
          onClick={() => onTab('files')}
        />
        <StatCard
          label="Environment variables"
          value={pkg.environmentVariables.length}
          hint={modifiedEnvVars > 0 ? `${modifiedEnvVars} edited in this session` : 'Definitions and values detected'}
          icon={<Variable size={19} />}
          tone="violet"
          onClick={() => onTab('environment')}
        />
        <StatCard
          label="Connection references"
          value={effectiveConnections.length}
          hint={
            effectiveConnections.length > 0
              ? mergedConnectionCount > 0
                ? `${mergedConnectionCount} merged · ${configuredConnections} target ID${
                    configuredConnections === 1 ? '' : 's'
                  } set`
                : `${configuredConnections} target connection ID${
                    configuredConnections === 1 ? '' : 's'
                  } set`
              : 'No connection references in package'
          }
          icon={<Cable size={19} />}
          tone="success"
          onClick={() => onTab('connections')}
        />
        <StatCard
          label="Missing dependencies"
          value={missingCount}
          hint={
            pkg.solution.missingDependencies.length === 0
              ? 'Nothing unresolved'
              : edits.removeMissingDependencies
                ? 'Will be stripped on download'
                : 'Will remain in solution.xml'
          }
          icon={<Link2Off size={19} />}
          tone={missingCount > 0 ? 'warning' : 'success'}
          onClick={() => onTab('dependencies')}
        />
        <StatCard
          label="ZIP entries"
          value={pkg.files.length}
          hint={formatBytes(pkg.fileSize)}
          icon={<FolderArchive size={19} />}
          tone="neutral"
          onClick={() => onTab('files')}
        />
      </div>

      <div className="overview-columns">
        <SectionCard
          title="Pre-import checklist"
          description="Automated checks against the package you are about to download."
          icon={<Gauge size={18} />}
          actions={
            <Button variant="ghost" size="sm" onClick={() => onTab('solution')}>
              Open settings
            </Button>
          }
        >
          <div className="checklist">
            {health.checks.slice(0, 9).map((check) => (
              <div className="checklist-row" key={check.id}>
                <StatusIcon status={check.status} />
                <div className="checklist-copy">
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                </div>
                <span className="checklist-category">{check.category}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="overview-side">
          <SectionCard
            title="Pending changes"
            description="Nothing is written to disk until you download."
            icon={<GitCompareArrows size={18} />}
          >
            {changes.length === 0 ? (
              <div className="clean-state">
                <div className="clean-icon">
                  <Check size={20} />
                </div>
                <strong>Everything matches the original</strong>
                <p>Edit the version, dependencies or environment values to start a change set.</p>
              </div>
            ) : (
              <div className="change-list compact">
                {changes.slice(0, 6).map((change) => (
                  <div className="change-row" key={change.id}>
                    <span className={`change-dot change-${change.category}`} />
                    <div className="change-copy">
                      <strong>{change.label}</strong>
                      <span>
                        {change.before ? (
                          <>
                            <code>{change.before}</code> <ArrowRight size={11} /> <code>{change.after}</code>
                          </>
                        ) : (
                          change.after
                        )}
                      </span>
                    </div>
                  </div>
                ))}
                {changes.length > 6 ? (
                  <span className="change-overflow">+{changes.length - 6} more changes</span>
                ) : null}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Quick actions"
            icon={<Sparkles size={18} />}
            className="quick-actions-card"
          >
            <div className="quick-actions">
              <button type="button" onClick={onBumpBuild} className="quick-action">
                <span className="quick-action-icon">
                  <Plus size={16} />
                </span>
                <span>
                  <strong>Bump build</strong>
                  <small>Increment the third version part</small>
                </span>
                <ChevronRight size={15} />
              </button>
              <button type="button" onClick={() => onTab('environment')} className="quick-action">
                <span className="quick-action-icon">
                  <Variable size={16} />
                </span>
                <span>
                  <strong>Edit environment values</strong>
                  <small>{pluralize(pkg.environmentVariables.length, 'variable')} discovered</small>
                </span>
                <ChevronRight size={15} />
              </button>
              <button type="button" onClick={() => onTab('deployment')} className="quick-action">
                <span className="quick-action-icon">
                  <FileJson size={16} />
                </span>
                <span>
                  <strong>Deployment settings</strong>
                  <small>Build a PAC-compatible JSON file</small>
                </span>
                <ChevronRight size={15} />
              </button>
              <button type="button" onClick={() => onTab('files')} className="quick-action">
                <span className="quick-action-icon">
                  <Search size={16} />
                </span>
                <span>
                  <strong>Explore ZIP contents</strong>
                  <small>{pluralize(pkg.files.length, 'file')} inside the package</small>
                </span>
                <ChevronRight size={15} />
              </button>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="overview-columns reverse">
        <SectionCard
          title="Package details"
          description="Metadata read directly from solution.xml."
          icon={<FileArchive size={18} />}
        >
          <dl className="detail-grid">
            <Detail label="Display name" value={pkg.solution.displayName} />
            <Detail label="Unique name" value={pkg.solution.uniqueName} mono />
            <Detail label="Publisher" value={pkg.solution.publisher.displayName} />
            <Detail label="Publisher prefix" value={pkg.solution.publisher.prefix || 'Not set'} mono />
            <Detail label="Current version" value={pkg.solution.version} mono />
            <Detail label="Version parts" value={pkg.solution.version.split('.').join(' · ')} mono />
            <Detail label="Package state" value={pkg.solution.managed ? 'Managed' : 'Unmanaged'} />
            <Detail label="Language code" value={pkg.solution.languageCode} />
            <Detail label="Source file" value={pkg.fileName} />
            <Detail label="File size" value={formatBytes(pkg.fileSize)} />
            <Detail label="Loaded" value={formatDate(pkg.loadedAt)} />
            <Detail
              label="Optional features"
              value={[
                pkg.hasWebResources ? 'Web resources' : '',
                pkg.hasFlows ? 'Flows / workflows' : '',
                pkg.hasPluginAssemblies ? 'Plugins' : '',
                pkg.hasCanvasApps ? 'Canvas apps' : '',
              ]
                .filter(Boolean)
                .join(', ') || 'Standard components'}
            />
          </dl>
        </SectionCard>

        <SectionCard
          title="Deployment readiness"
          description="What happens when you rebuild this package."
          icon={<Rocket size={18} />}
        >
          <div className="readiness-list">
            <ReadinessRow
              icon={<CircleDot size={15} />}
              label="Output version"
              value={edits.version}
              tone={edits.version !== pkg.solution.version ? 'changed' : 'default'}
            />
            <ReadinessRow
              icon={<Shield size={15} />}
              label="Manifest state"
              value={edits.managed ? 'Managed flag' : 'Unmanaged flag'}
              tone={edits.managed !== pkg.solution.managed ? 'changed' : 'default'}
            />
            <ReadinessRow
              icon={<Link2Off size={15} />}
              label="Missing dependencies"
              value={edits.removeMissingDependencies ? 'Remove on download' : 'Preserve as-is'}
              tone={edits.removeMissingDependencies ? 'changed' : 'default'}
            />
            <ReadinessRow
              icon={<Variable size={15} />}
              label="Environment values"
              value={modifiedEnvVars > 0 ? `${modifiedEnvVars} override${modifiedEnvVars === 1 ? '' : 's'}` : 'Original values'}
              tone={modifiedEnvVars > 0 ? 'changed' : 'default'}
            />
            <ReadinessRow
              icon={<CalendarClock size={15} />}
              label="Original package"
              value="Never modified"
              tone="safe"
            />
          </div>
          <div className="readiness-actions">
            <Button variant="primary" size="sm" icon={<FileJson size={15} />} onClick={() => onTab('deployment')}>
              Build deployment settings
            </Button>
            <Button variant="ghost" size="sm" icon={<Info size={15} />} onClick={() => onTab('advanced')}>
              Inspect raw XML
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : undefined} title={value}>
        {value || '—'}
      </dd>
    </div>
  )
}

function ReadinessRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  tone: 'default' | 'changed' | 'safe'
}) {
  return (
    <div className="readiness-row">
      <span className={`readiness-icon readiness-${tone}`}>{icon}</span>
      <span>{label}</span>
      <strong className={tone === 'changed' ? 'text-accent' : undefined}>{value}</strong>
    </div>
  )
}
