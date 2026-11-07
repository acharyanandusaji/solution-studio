import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DeploymentProfile,
  SolutionEdits,
  SolutionPackage,
  TabId,
  ToastKind,
  ToastMessage,
  VersionHistoryEntry,
} from './types'
import {
  buildEditedPackage,
  downloadBlob,
  initialEdits,
  loadSolutionPackage,
} from './lib/package'
import { buildHealthReport } from './lib/validation'
import { buildChangeList } from './lib/changes'
import { uid } from './lib/format'
import { bumpVersion } from './lib/xml'
import { createSampleSolutionFile } from './lib/sample'
import {
  addVersionHistory,
  clearVersionHistory,
  deleteProfile,
  getProfiles,
  getVersionHistory,
  saveProfile,
} from './lib/storage'
import { UploadScreen } from './components/UploadScreen'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { OverviewTab } from './components/OverviewTab'
import { SolutionTab } from './components/SolutionTab'
import { EnvironmentTab } from './components/EnvironmentTab'
import { ConnectionsTab } from './components/ConnectionsTab'
import { DependenciesTab } from './components/DependenciesTab'
import { DeploymentTab } from './components/DeploymentTab'
import { FilesTab } from './components/FilesTab'
import { AdvancedTab } from './components/AdvancedTab'
import { ReviewDialog } from './components/ReviewDialog'
import { BusyOverlay, ConfirmDialog } from './components/Dialogs'
import { ToastStack } from './components/ui'

export default function App() {
  const [pkg, setPkg] = useState<SolutionPackage | null>(null)
  const [edits, setEdits] = useState<SolutionEdits | null>(null)
  const [tab, setTab] = useState<TabId>('overview')
  const [busy, setBusy] = useState<{ title: string; detail?: string } | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [uploadError, setUploadError] = useState<string | undefined>()
  const [mobileNav, setMobileNav] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [sampleLoading, setSampleLoading] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [history, setHistory] = useState<VersionHistoryEntry[]>([])
  const [profiles, setProfiles] = useState<DeploymentProfile[]>([])
  const toastId = useRef(0)

  const toast = useCallback((kind: ToastKind, title: string, detail?: string) => {
    toastId.current += 1
    const id = toastId.current
    setToasts((current) => [...current.slice(-3), { id, kind, title, detail }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 7000)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const loadFile = useCallback(
    async (file: File) => {
      setUploadError(undefined)
      setBusy({
        title: 'Inspecting solution package',
        detail: 'Extracting the ZIP and parsing Power Platform XML locally…',
      })
      await new Promise((resolve) => window.setTimeout(resolve, 80))
      try {
        const loaded = await loadSolutionPackage(file)
        setPkg(loaded)
        setEdits(initialEdits(loaded))
        setTab('overview')
        setMobileNav(false)
        setHistory(getVersionHistory(loaded.solution.uniqueName))
        setProfiles(getProfiles(loaded.solution.uniqueName))
        setReviewOpen(false)
        toast(
          'success',
          'Solution package loaded',
          `${loaded.files.length} ZIP entries · ${loaded.solution.displayName} v${loaded.solution.version}`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setUploadError(message)
        toast('error', 'Could not open the solution', message)
      } finally {
        setBusy(null)
      }
    },
    [toast],
  )

  const handleSample = async () => {
    setSampleLoading(true)
    try {
      const file = await createSampleSolutionFile()
      await loadFile(file)
    } catch (error) {
      toast('error', 'Could not create the sample', (error as Error).message)
    } finally {
      setSampleLoading(false)
    }
  }

  const updateEdits = useCallback((patch: Partial<SolutionEdits>) => {
    setEdits((current) => (current ? { ...current, ...patch } : current))
  }, [])

  const setEnvironmentValue = useCallback((schemaName: string, value: string) => {
    setEdits((current) =>
      current
        ? { ...current, envVarValues: { ...current.envVarValues, [schemaName]: value } }
        : current,
    )
  }, [])

  const revertEnvironmentValue = useCallback((schemaName: string) => {
    setEdits((current) => {
      if (!current) return current
      const next = { ...current.envVarValues }
      delete next[schemaName]
      return { ...current, envVarValues: next }
    })
  }, [])

  const setConnectionId = useCallback((logicalName: string, connectionId: string) => {
    setEdits((current) =>
      current
        ? { ...current, connectionIds: { ...current.connectionIds, [logicalName]: connectionId } }
        : current,
    )
  }, [])

  const changes = useMemo(
    () => (pkg && edits ? buildChangeList(pkg, edits) : []),
    [pkg, edits],
  )
  const health = useMemo(
    () => (pkg && edits ? buildHealthReport(pkg, edits) : null),
    [pkg, edits],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (pkg && edits) setReviewOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pkg, edits])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [tab])

  const handleDownload = async () => {
    if (!pkg || !edits || !health) return
    if (health.failed > 0) {
      toast('error', 'Fix failed checks first', 'Open the review dialog to see what needs attention.')
      return
    }
    setDownloading(true)
    await new Promise((resolve) => window.setTimeout(resolve, 60))
    try {
      const result = await buildEditedPackage(pkg, edits)
      downloadBlob(result.blob, result.fileName)
      const entry: VersionHistoryEntry = {
        id: uid(),
        solutionUniqueName: pkg.solution.uniqueName,
        version: edits.version,
        managed: edits.managed,
        missingDependenciesRemoved:
          edits.removeMissingDependencies && pkg.solution.missingDependencies.length > 0,
        envVarChanges: result.appliedEnvironmentVariables,
        timestamp: new Date().toISOString(),
        fileName: result.fileName,
      }
      addVersionHistory(entry)
      setHistory(getVersionHistory(pkg.solution.uniqueName))
      setReviewOpen(false)
      toast(
        'success',
        'Solution ZIP downloaded',
        `${result.fileName} · ${result.appliedEnvironmentVariables} environment value${
          result.appliedEnvironmentVariables === 1 ? '' : 's'
        } written`,
      )
    } catch (error) {
      toast('error', 'Could not build the ZIP', (error as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  const handleDiscard = () => {
    setPkg(null)
    setEdits(null)
    setHistory([])
    setProfiles([])
    setUploadError(undefined)
    setTab('overview')
    setMobileNav(false)
    setReviewOpen(false)
    setDiscardOpen(false)
    toast('info', 'Workspace reset', 'Upload another solution ZIP to continue.')
  }

  const handleSaveProfile = (profile: DeploymentProfile) => {
    if (!pkg) return
    setProfiles(saveProfile(pkg.solution.uniqueName, profile))
  }

  const handleApplyProfile = (profile: DeploymentProfile) => {
    if (!pkg || !edits) return
    const envVarValues = { ...edits.envVarValues }
    const connectionIds = { ...edits.connectionIds }
    for (const variable of pkg.environmentVariables) {
      if (Object.prototype.hasOwnProperty.call(profile.values, variable.schemaName)) {
        envVarValues[variable.schemaName] = profile.values[variable.schemaName]
      }
    }
    for (const reference of pkg.connectionReferences) {
      if (Object.prototype.hasOwnProperty.call(profile.connectionIds, reference.logicalName)) {
        connectionIds[reference.logicalName] = profile.connectionIds[reference.logicalName]
      }
    }
    setEdits({ ...edits, envVarValues, connectionIds })
    toast('success', 'Profile loaded', `${profile.name} values are now applied to this session.`)
  }

  const handleDeleteProfile = (profileId: string) => {
    if (!pkg) return
    setProfiles(deleteProfile(pkg.solution.uniqueName, profileId))
    toast('info', 'Profile deleted')
  }

  const handleImportedSettings = (settings: {
    envValues: Record<string, string>
    connectionIds: Record<string, string>
  }) => {
    if (!edits) return
    setEdits({
      ...edits,
      envVarValues: { ...edits.envVarValues, ...settings.envValues },
      connectionIds: { ...edits.connectionIds, ...settings.connectionIds },
    })
  }

  const handleUseHistoryVersion = (entry: VersionHistoryEntry) => {
    updateEdits({ version: entry.version, managed: entry.managed })
    toast('info', 'Version restored from history', `Target version is now ${entry.version}.`)
  }

  const clearHistory = () => {
    if (!pkg) return
    clearVersionHistory(pkg.solution.uniqueName)
    setHistory([])
    toast('info', 'Version history cleared')
  }

  const content =
    pkg && edits && health ? (
      <>
        {tab === 'overview' ? (
          <OverviewTab
            pkg={pkg}
            edits={edits}
            health={health}
            changes={changes}
            onTab={setTab}
            onBumpBuild={() => updateEdits({ version: bumpVersion(edits.version, 2) })}
          />
        ) : null}
        {tab === 'solution' ? (
          <SolutionTab
            pkg={pkg}
            edits={edits}
            onChange={updateEdits}
            history={history}
            onUseHistoryVersion={handleUseHistoryVersion}
            onClearHistory={clearHistory}
          />
        ) : null}
        {tab === 'environment' ? (
          <EnvironmentTab
            pkg={pkg}
            edits={edits}
            onSetValue={setEnvironmentValue}
            onRevertValue={revertEnvironmentValue}
            onRevertAll={() => updateEdits({ envVarValues: {} })}
            onOpenDeployment={() => setTab('deployment')}
          />
        ) : null}
        {tab === 'connections' ? (
          <ConnectionsTab
            pkg={pkg}
            edits={edits}
            onSetConnectionId={setConnectionId}
            onOpenDeployment={() => setTab('deployment')}
            onNotifyCopied={(ok) =>
              toast(ok ? 'success' : 'error', ok ? 'Copied to clipboard' : 'Copy failed')
            }
          />
        ) : null}
        {tab === 'dependencies' ? (
          <DependenciesTab pkg={pkg} edits={edits} onChange={updateEdits} />
        ) : null}
        {tab === 'deployment' ? (
          <DeploymentTab
            pkg={pkg}
            edits={edits}
            profiles={profiles}
            onApplyProfile={handleApplyProfile}
            onSaveProfile={handleSaveProfile}
            onDeleteProfile={handleDeleteProfile}
            onApplyImportedSettings={handleImportedSettings}
            onOpenConnections={() => setTab('connections')}
            onNotify={(kind, title, detail) => toast(kind, title, detail)}
          />
        ) : null}
        {tab === 'files' ? (
          <FilesTab key={pkg.fileName} pkg={pkg} onNotify={(kind, title, detail) => toast(kind, title, detail)} />
        ) : null}
        {tab === 'advanced' ? (
          <AdvancedTab
            pkg={pkg}
            edits={edits}
            onChange={updateEdits}
            onNotify={(kind, title, detail) => toast(kind, title, detail)}
          />
        ) : null}
      </>
    ) : null

  return (
    <>
      {!pkg || !edits || !health ? (
        <UploadScreen
          onFile={loadFile}
          onSample={() => void handleSample()}
          sampleLoading={sampleLoading}
          error={uploadError}
        />
      ) : (
        <div className="app-shell">
          <Sidebar
            pkg={pkg}
            edits={edits}
            tab={tab}
            onTab={setTab}
            open={mobileNav}
            onClose={() => setMobileNav(false)}
            onDiscard={() => setDiscardOpen(true)}
            changeCount={changes.length}
            healthScore={health.score}
          />
          <div className="app-main">
            <Topbar
              pkg={pkg}
              edits={edits}
              tab={tab}
              onMenu={() => setMobileNav(true)}
              onReview={() => setReviewOpen(true)}
              onDownload={() => setReviewOpen(true)}
              changeCount={changes.length}
              downloading={downloading}
            />
            <main className="app-content">{content}</main>
            <footer className="app-footer">
              <span>Solution Studio · Local-only Power Platform ALM utility</span>
              <span>Original packages are never modified</span>
            </footer>
          </div>
        </div>
      )}

      {pkg && edits && health ? (
        <ReviewDialog
          key={`${reviewOpen}-${edits.removeMissingDependencies}`}
          open={reviewOpen}
          pkg={pkg}
          edits={edits}
          health={health}
          changes={changes}
          onClose={() => setReviewOpen(false)}
          onDownload={() => void handleDownload()}
          downloading={downloading}
        />
      ) : null}

      <ConfirmDialog
        open={discardOpen}
        title="Start over with a new solution?"
        description="This clears the current session. Your original ZIP file is never modified."
        confirmLabel="Discard session"
        danger
        onConfirm={handleDiscard}
        onClose={() => setDiscardOpen(false)}
      >
        <p>
          All unsaved edits, raw XML changes, deployment mappings and the loaded package will be removed from
          this browser tab. Downloaded files are not affected.
        </p>
      </ConfirmDialog>

      <BusyOverlay busy={busy} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
