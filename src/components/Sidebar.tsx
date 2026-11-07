import type { ReactNode } from 'react'
import {
  Boxes,
  Cable,
  ChevronRight,
  CircleCheck,
  FileCode2,
  FileJson,
  FolderArchive,
  LayoutDashboard,
  Link2Off,
  LockKeyhole,
  Package,
  RotateCcw,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  Variable,
  X,
} from 'lucide-react'
import { cx } from '../lib/format'
import type { SolutionEdits, SolutionPackage, TabId } from '../types'
import { Badge, IconButton } from './ui'

const NAV: Array<{
  id: TabId
  label: string
  icon: ReactNode
  group: 'Workspace' | 'Package'
}> = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} />, group: 'Workspace' },
  { id: 'solution', label: 'Solution', icon: <Settings2 size={18} />, group: 'Workspace' },
  { id: 'environment', label: 'Environment variables', icon: <Variable size={18} />, group: 'Workspace' },
  { id: 'connections', label: 'Connection references', icon: <Cable size={18} />, group: 'Workspace' },
  { id: 'dependencies', label: 'Dependencies', icon: <Link2Off size={18} />, group: 'Workspace' },
  { id: 'deployment', label: 'Deployment settings', icon: <FileJson size={18} />, group: 'Package' },
  { id: 'files', label: 'ZIP explorer', icon: <FolderArchive size={18} />, group: 'Package' },
  { id: 'advanced', label: 'Advanced XML', icon: <FileCode2 size={18} />, group: 'Package' },
]

export function Sidebar({
  pkg,
  edits,
  tab,
  onTab,
  open,
  onClose,
  onDiscard,
  changeCount,
  healthScore,
}: {
  pkg: SolutionPackage
  edits: SolutionEdits
  tab: TabId
  onTab: (tab: TabId) => void
  open: boolean
  onClose: () => void
  onDiscard: () => void
  changeCount: number
  healthScore: number
}) {
  const counts: Partial<Record<TabId, number>> = {
    environment: pkg.environmentVariables.length,
    connections: pkg.connectionReferences.length,
    dependencies: pkg.solution.missingDependencies.length,
    files: pkg.files.length,
  }

  return (
    <>
      <div className={cx('sidebar-backdrop', open && 'is-visible')} onClick={onClose} aria-hidden="true" />
      <aside className={cx('sidebar', open && 'is-open')}>
        <div className="sidebar-brand-row">
          <div className="brand">
            <span className="brand-mark">
              <Boxes size={21} />
            </span>
            <span className="brand-copy">
              <strong>Solution Studio</strong>
              <span>Power Platform ALM</span>
            </span>
          </div>
          <IconButton label="Close navigation" className="sidebar-close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>

        <button type="button" className="package-card" onClick={() => onTab('overview')}>
          <div className="package-icon">
            <Package size={20} />
          </div>
          <div className="package-copy">
            <strong title={pkg.solution.displayName}>{pkg.solution.displayName}</strong>
            <span title={pkg.fileName}>{pkg.fileName}</span>
            <div className="package-tags">
              <span
                className="mini-tag"
                title={`Uploaded version ${pkg.solution.version}; download will use ${edits.version}`}
              >
                v{edits.version}
              </span>
              <span
                className={cx('mini-tag', edits.managed ? 'mini-tag-managed' : 'mini-tag-unmanaged')}
                title={`Uploaded as ${pkg.solution.managed ? 'managed' : 'unmanaged'}`}
              >
                {edits.managed ? 'Managed' : 'Unmanaged'}
              </span>
            </div>
          </div>
          <ChevronRight size={16} className="package-chevron" />
        </button>

        <div className="sidebar-health">
          <div className="sidebar-health-copy">
            <span>Package health</span>
            <strong>{healthScore}/100</strong>
          </div>
          <div className="health-bar">
            <span style={{ width: `${healthScore}%` }} className={cx(healthScore < 65 && 'is-low', healthScore < 85 && healthScore >= 65 && 'is-mid')} />
          </div>
          <div className="sidebar-health-foot">
            {healthScore >= 85 ? <CircleCheck size={13} /> : <TriangleAlert size={13} />}
            {healthScore >= 85 ? 'Ready to review' : 'Attention recommended'}
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace sections">
          {(['Workspace', 'Package'] as const).map((group) => (
            <div className="nav-group" key={group}>
              <span className="nav-group-label">{group}</span>
              {NAV.filter((item) => item.group === group).map((item) => {
                const count = counts[item.id]
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cx('nav-item', tab === item.id && 'is-active')}
                    onClick={() => {
                      onTab(item.id)
                      onClose()
                    }}
                    aria-current={tab === item.id ? 'page' : undefined}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    <span className="nav-label">{item.label}</span>
                    {typeof count === 'number' && count > 0 ? (
                      <span className={cx('nav-count', item.id === 'dependencies' && 'is-warn')}>{count}</span>
                    ) : null}
                    {tab === item.id ? <span className="nav-active-dot" /> : null}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {changeCount > 0 ? (
            <div className="sidebar-changes">
              <span className="pulse-dot" />
              <span>{changeCount} unsaved change{changeCount === 1 ? '' : 's'}</span>
            </div>
          ) : (
            <div className="sidebar-changes is-clean">
              <ShieldCheck size={14} />
              <span>No pending changes</span>
            </div>
          )}
          <div className="local-note">
            <LockKeyhole size={15} />
            <span>100% local. Files never leave this browser.</span>
          </div>
          <button type="button" className="discard-link" onClick={onDiscard}>
            <RotateCcw size={14} /> Start over with a new file
          </button>
          <Badge tone="neutral" className="version-badge">
            v1.0 · Open source
          </Badge>
        </div>
      </aside>
    </>
  )
}
