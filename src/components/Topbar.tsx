import { Download, GitCompareArrows, Menu, ShieldCheck } from 'lucide-react'
import type { SolutionEdits, SolutionPackage, TabId } from '../types'
import { Badge, Button, IconButton } from './ui'

const TAB_LABELS: Record<TabId, string> = {
  overview: 'Overview',
  cloud: 'Power Platform',
  solution: 'Solution settings',
  environment: 'Environment variables',
  connections: 'Connection references',
  dependencies: 'Dependency analysis',
  deployment: 'Deployment settings',
  files: 'ZIP explorer',
  advanced: 'Advanced XML',
}

export function Topbar({
  pkg,
  edits,
  tab,
  onMenu,
  onReview,
  onDownload,
  changeCount,
  downloading,
}: {
  pkg: SolutionPackage
  edits: SolutionEdits
  tab: TabId
  onMenu: () => void
  onReview: () => void
  onDownload: () => void
  changeCount: number
  downloading: boolean
}) {
  const versionChanged = edits.version !== pkg.solution.version
  const managedChanged = edits.managed !== pkg.solution.managed

  return (
    <header className="topbar">
      <div className="topbar-left">
        <IconButton label="Open navigation" className="menu-button" onClick={onMenu}>
          <Menu size={20} />
        </IconButton>
        <div className="topbar-title">
          <div className="breadcrumb">
            <span>{pkg.solution.displayName}</span>
            <span className="breadcrumb-sep">/</span>
            <span>{TAB_LABELS[tab]}</span>
          </div>
          <div className="topbar-chips">
            <Badge
              tone={versionChanged ? 'info' : 'neutral'}
              title={
                versionChanged
                  ? `Uploaded version ${pkg.solution.version}; download will use ${edits.version}`
                  : `Version ${edits.version}`
              }
            >
              v{edits.version}
            </Badge>
            <Badge tone={edits.managed ? 'violet' : 'success'} dot>
              {edits.managed ? 'Managed' : 'Unmanaged'}
            </Badge>
            {versionChanged || managedChanged ? <Badge tone="warning">Target settings</Badge> : null}
            <span className="topbar-local">
              <ShieldCheck size={13} /> Local session
            </span>
          </div>
        </div>
      </div>
      <div className="topbar-actions">
        <Button
          variant={changeCount > 0 ? 'secondary' : 'ghost'}
          icon={<GitCompareArrows size={16} />}
          onClick={onReview}
          className="review-button"
        >
          Review changes
          {changeCount > 0 ? <span className="action-count">{changeCount}</span> : null}
        </Button>
        <Button
          variant="primary"
          icon={<Download size={16} />}
          onClick={onDownload}
          loading={downloading}
        >
          Download ZIP
        </Button>
      </div>
    </header>
  )
}
