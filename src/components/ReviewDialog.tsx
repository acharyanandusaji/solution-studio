import { useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileArchive,
  GitCompareArrows,
  GitMerge,
  Info,
  Link2Off,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import type {
  ChangeItem,
  HealthReport,
  SolutionEdits,
  SolutionPackage,
} from '../types'
import { outputFileName } from '../lib/package'
import { Badge, Button, Modal, ScoreRing, StatusIcon } from './ui'
import { formatBytes } from '../lib/format'

export function ReviewDialog({
  open,
  pkg,
  edits,
  health,
  changes,
  onClose,
  onDownload,
  downloading,
}: {
  open: boolean
  pkg: SolutionPackage
  edits: SolutionEdits
  health: HealthReport
  changes: ChangeItem[]
  onClose: () => void
  onDownload: () => void
  downloading: boolean
}) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [mergeAcknowledged, setMergeAcknowledged] = useState(false)

  const needsDependencyAck =
    edits.removeMissingDependencies && pkg.solution.missingDependencies.length > 0
  const mergedCount = pkg.connectionReferences.filter((reference) => {
    const survivor = edits.connectionMerges?.[reference.logicalName]
    return Boolean(survivor && survivor !== reference.logicalName)
  }).length
  const needsMergeAck = mergedCount > 0
  const blocking =
    health.failed > 0 ||
    (needsDependencyAck && !acknowledged) ||
    (needsMergeAck && !mergeAcknowledged)
  const fileName = outputFileName(pkg, edits)
  const managedChanged = edits.managed !== pkg.solution.managed
  const depsRemoved = edits.removeMissingDependencies && pkg.solution.missingDependencies.length > 0
  const envCount = Object.keys(edits.envVarValues).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review & download"
      description="Confirm every change before the rebuilt ZIP is generated."
      size="lg"
      footer={
        <>
          <span className="modal-footer-note">
            {health.failed > 0
              ? 'Fix failed checks before downloading.'
              : needsDependencyAck && !acknowledged
                ? 'Acknowledge dependency removal to continue.'
                : needsMergeAck && !mergeAcknowledged
                  ? 'Acknowledge the connection merge to continue.'
                  : `Original: ${formatBytes(Math.max(pkg.fileSize, 0))} → rebuilt ZIP`}
          </span>
          <Button variant="ghost" onClick={onClose} disabled={downloading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Download size={16} />}
            loading={downloading}
            disabled={blocking}
            onClick={onDownload}
          >
            Download edited ZIP
          </Button>
        </>
      }
    >
      <div className="review-banner">
        <div className="review-banner-icon">
          <ScoreRing score={health.score} size={76} />
        </div>
        <div className="review-banner-copy">
          <strong>
            {health.failed > 0
              ? 'This package is not ready yet'
              : health.warnings > 0
                ? 'Ready with a few warnings'
                : 'Ready to build'}
          </strong>
          <p>
            {health.passed} checks passed · {health.warnings} warnings · {health.failed} blockers.
            {health.warnings > 0 && health.failed === 0
              ? ' Warnings do not block the download, but review them before importing.'
              : ''}
          </p>
          <div className="review-badges">
            <Badge tone="neutral">{fileName}</Badge>
            <Badge tone={edits.managed ? 'violet' : 'success'} dot>
              {edits.managed ? 'Managed flag' : 'Unmanaged'}
            </Badge>
            <Badge tone={depsRemoved ? 'danger' : 'neutral'}>
              {depsRemoved ? 'Dependencies removed' : 'Dependencies preserved'}
            </Badge>
            {mergedCount > 0 ? (
              <Badge tone="info" dot>
                {mergedCount} connection{mergedCount === 1 ? '' : 's'} merged
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="review-grid">
        <div className="review-block">
          <div className="review-block-head">
            <GitCompareArrows size={17} />
            <h3>Change set</h3>
            <Badge tone={changes.length > 0 ? 'info' : 'neutral'}>{changes.length}</Badge>
          </div>
          {changes.length === 0 ? (
            <div className="review-empty">
              <CheckCircle2 size={18} />
              <span>No changes. The download will preserve all original values.</span>
            </div>
          ) : (
            <div className="review-change-list">
              {changes.map((change) => (
                <div className="review-change" key={change.id}>
                  <span className={`change-dot change-${change.category}`} />
                  <div>
                    <strong>{change.label}</strong>
                    <span>
                      {change.before ? (
                        <>
                          <code>{change.before}</code> <ArrowRight size={11} />{' '}
                          <code>{change.after}</code>
                        </>
                      ) : (
                        change.after
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="review-block">
          <div className="review-block-head">
            <ShieldCheck size={17} />
            <h3>Pre-import checks</h3>
            <Badge tone={health.failed > 0 ? 'danger' : health.warnings > 0 ? 'warning' : 'success'}>
              {health.failed > 0 ? 'Blocked' : health.warnings > 0 ? 'Review' : 'Healthy'}
            </Badge>
          </div>
          <div className="review-checks">
            {health.checks.map((check) => (
              <div className="review-check" key={check.id}>
                <StatusIcon status={check.status} />
                <div>
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {managedChanged ? (
        <div className="notice notice-warning review-notice">
          <ShieldAlert size={19} />
          <div>
            <strong>The managed flag is changing, but this is not a conversion.</strong>
            <p>
              The ZIP will be marked {edits.managed ? 'managed' : 'unmanaged'} in solution.xml. To genuinely
              convert the package, export it from Dataverse with the desired managed setting.
            </p>
          </div>
        </div>
      ) : null}

      {needsMergeAck ? (
        <div className="notice notice-warning review-notice">
          <GitMerge size={19} />
          <div>
            <strong>
              {mergedCount} connection reference{mergedCount === 1 ? '' : 's'} will be removed and replaced.
            </strong>
            <p>
              Cloud flow definitions are rewritten to use the surviving reference. References on other
              connectors are untouched. Canvas apps (.msapp) cannot be rewritten, so check them after import.
            </p>
          </div>
        </div>
      ) : null}

      {envCount > 0 ? (
        <div className="notice notice-info review-notice">
          <Info size={19} />
          <div>
            <strong>
              {envCount} environment value{envCount === 1 ? '' : 's'} will be written to customizations.xml or the environment variable value files.
            </strong>
            <p>Make sure these values are correct for the target environment, or use DeploymentSettings.json instead.</p>
          </div>
        </div>
      ) : null}

      <div className="review-output">
        <FileArchive size={18} />
        <div>
          <span>Output file</span>
          <code>{fileName}</code>
        </div>
        <div className="review-output-side">
          <span>Version</span>
          <strong>{edits.version}</strong>
        </div>
      </div>

      {needsDependencyAck ? (
        <label className="ack-row">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            <strong>I understand the MissingDependencies list will be cleared.</strong>
            <span>
              The element stays as an empty <code>&lt;MissingDependencies /&gt;</code>, but the required
              components must already exist in the target environment. Clearing metadata does not install them.
            </span>
          </span>
          <AlertTriangle size={16} />
        </label>
      ) : null}

      {needsMergeAck ? (
        <label className="ack-row">
          <input
            type="checkbox"
            checked={mergeAcknowledged}
            onChange={(event) => setMergeAcknowledged(event.target.checked)}
          />
          <span>
            <strong>I understand the rebuilt ZIP will contain only the surviving connection reference.</strong>
            <span>
              Verify the rewritten flows and any canvas apps in the target environment after import.
            </span>
          </span>
          <AlertTriangle size={16} />
        </label>
      ) : null}

      {health.failed > 0 ? (
        <div className="review-blocked">
          <XCircle size={18} />
          <span>Resolve the failed checks above before downloading the package.</span>
        </div>
      ) : null}

      {!needsDependencyAck && !needsMergeAck && health.failed === 0 ? (
        <div className="review-safe">
          <Link2Off size={16} />
          <span>Original package remains untouched. Your download is a separate, newly generated ZIP.</span>
        </div>
      ) : null}
    </Modal>
  )
}
