import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  FileCode2,
  Info,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import type { SolutionEdits, SolutionPackage } from '../types'
import { validateXml } from '../lib/xml'
import { Badge, Button, CopyButton, SectionCard } from './ui'

type XmlFile = 'solution' | 'customizations'

export function AdvancedTab({
  pkg,
  edits,
  onChange,
  onNotify,
}: {
  pkg: SolutionPackage
  edits: SolutionEdits
  onChange: (patch: Partial<SolutionEdits>) => void
  onNotify: (kind: 'success' | 'error' | 'info', title: string, detail?: string) => void
}) {
  const [file, setFile] = useState<XmlFile>('solution')
  const [solutionDraft, setSolutionDraft] = useState(edits.solutionXmlOverride ?? pkg.solutionXml)
  const [customizationsDraft, setCustomizationsDraft] = useState(
    edits.customizationsXmlOverride ?? pkg.customizationsXml,
  )
  const [validation, setValidation] = useState<{ valid: boolean; error?: string } | null>(null)

  useEffect(() => {
    setSolutionDraft(edits.solutionXmlOverride ?? pkg.solutionXml)
    setCustomizationsDraft(edits.customizationsXmlOverride ?? pkg.customizationsXml)
    setValidation(null)
    setFile('solution')
    // Reset drafts only when a different package is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg.solution.uniqueName, pkg.fileName])

  const original = file === 'solution' ? pkg.solutionXml : pkg.customizationsXml
  const draft = file === 'solution' ? solutionDraft : customizationsDraft
  const applied = file === 'solution' ? edits.solutionXmlOverride : edits.customizationsXmlOverride
  const hasOverride = Boolean(applied)
  const dirty = draft !== original
  const unapplied = hasOverride && draft !== applied
  const lineCount = useMemo(() => draft.split('\n').length, [draft])
  const missingCustomizations = !pkg.customizationsXml

  const setDraft = (value: string) => {
    if (file === 'solution') setSolutionDraft(value)
    else setCustomizationsDraft(value)
    setValidation(null)
  }

  const apply = () => {
    const result = validateXml(draft)
    setValidation(result)
    if (!result.valid) {
      onNotify('error', 'XML is not well-formed', result.error)
      return
    }
    if (draft === original) {
      onChange(
        file === 'solution'
          ? { solutionXmlOverride: undefined }
          : { customizationsXmlOverride: undefined },
      )
      onNotify('info', 'No raw override needed', 'The editor matches the original file.')
      return
    }
    onChange(
      file === 'solution'
        ? { solutionXmlOverride: draft }
        : { customizationsXmlOverride: draft },
    )
    onNotify(
      'success',
      'Raw XML applied',
      `${file === 'solution' ? 'solution.xml' : 'customizations.xml'} will use this content as its download base.`,
    )
  }

  const reset = () => {
    if (file === 'solution') {
      setSolutionDraft(pkg.solutionXml)
      onChange({ solutionXmlOverride: undefined })
    } else {
      setCustomizationsDraft(pkg.customizationsXml)
      onChange({ customizationsXmlOverride: undefined })
    }
    setValidation(null)
    onNotify('info', 'Raw XML reset', 'The original file content is restored.')
  }

  const validate = () => {
    const result = validateXml(draft)
    setValidation(result)
    if (result.valid) onNotify('success', 'XML is well-formed', 'The editor content passed validation.')
    else onNotify('error', 'XML is not well-formed', result.error)
  }

  const selectFile = (next: XmlFile) => {
    setFile(next)
    setValidation(null)
  }

  return (
    <div className="tab-stack">
      <div className="tab-heading">
        <div>
          <h1>Advanced XML</h1>
          <p>
            Inspect or replace the raw manifest and customizations files. Use this only when the structured
            editors cannot express what you need.
          </p>
        </div>
        {hasOverride ? <Badge tone="violet" dot>Raw override active</Badge> : <Badge tone="neutral">Original content</Badge>}
      </div>

      <div className="notice notice-warning">
        <ShieldAlert size={19} />
        <div>
          <strong>Raw editing bypasses the safety of the structured forms.</strong>
          <p>
            Structured edits (version, managed flag, dependency removal and environment values) are still
            applied on top of the raw base when you download. Invalid XML blocks the download, but semantic
            mistakes can still break an import.
          </p>
        </div>
      </div>

      <div className="xml-tabs">
        <button
          type="button"
          className={file === 'solution' ? 'is-active' : undefined}
          onClick={() => selectFile('solution')}
        >
          <FileCode2 size={16} />
          solution.xml
          {edits.solutionXmlOverride ? <span className="tab-dot" /> : null}
        </button>
        <button
          type="button"
          className={file === 'customizations' ? 'is-active' : undefined}
          onClick={() => selectFile('customizations')}
          disabled={missingCustomizations}
          title={missingCustomizations ? 'This package has no customizations.xml' : undefined}
        >
          <Code2 size={16} />
          customizations.xml
          {edits.customizationsXmlOverride ? <span className="tab-dot" /> : null}
        </button>
      </div>

      <SectionCard
        title={file === 'solution' ? 'solution.xml' : 'customizations.xml'}
        description={
          missingCustomizations && file === 'customizations'
            ? 'This package does not contain customizations.xml.'
            : `${lineCount.toLocaleString()} lines · ${draft.length.toLocaleString()} characters${
                dirty ? ' · draft differs from original' : ' · matches original'
              }`
        }
        icon={<FileCode2 size={18} />}
        actions={
          <div className="xml-toolbar">
            <CopyButton text={draft} onCopied={(ok) => onNotify(ok ? 'success' : 'error', ok ? 'Copied XML' : 'Copy failed')} />
            <Button size="sm" variant="ghost" icon={<ShieldCheck size={14} />} onClick={validate}>
              Validate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw size={14} />}
              onClick={reset}
              disabled={!dirty && !hasOverride}
            >
              Reset
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Save size={14} />}
              onClick={apply}
              disabled={!dirty && !hasOverride}
            >
              Apply
            </Button>
          </div>
        }
        bodyClassName="no-pad"
      >
        {missingCustomizations && file === 'customizations' ? (
          <div className="empty-editor">
            <Info size={22} />
            <strong>No customizations.xml in this package</strong>
            <p>Managed exports and some solution types do not include customizations.xml.</p>
          </div>
        ) : (
          <div className="xml-editor-wrap">
            <div className="xml-statusbar">
              <span className="xml-file-pill">
                <span className={`xml-dot ${hasOverride ? 'is-overridden' : ''}`} />
                {file === 'solution' ? pkg.solutionPath : pkg.customizationsPath}
              </span>
              <div className="xml-status">
                {unapplied ? (
                  <Badge tone="warning" dot>
                    Unapplied draft
                  </Badge>
                ) : hasOverride ? (
                  <Badge tone="violet">Applied override</Badge>
                ) : (
                  <Badge tone="neutral">Original</Badge>
                )}
                <span>{lineCount.toLocaleString()} lines</span>
                <span>{new Blob([draft]).size.toLocaleString()} bytes</span>
              </div>
            </div>
            <textarea
              className="xml-editor"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck={false}
              wrap="off"
              aria-label={`${file}.xml raw editor`}
            />
            <div className="xml-editor-footer">
              <span>
                <AlertTriangle size={13} /> XML is not auto-saved. Apply to include this content in the download.
              </span>
              <span>Tab size 2 · UTF-8</span>
            </div>
          </div>
        )}
      </SectionCard>

      {validation ? (
        <div className={`notice ${validation.valid ? 'notice-success' : 'notice-danger'}`}>
          {validation.valid ? <CheckCircle2 size={19} /> : <XCircle size={19} />}
          <div>
            <strong>{validation.valid ? 'XML validation passed' : 'XML validation failed'}</strong>
            <p>{validation.valid ? 'The document is well-formed and can be parsed.' : validation.error}</p>
          </div>
        </div>
      ) : null}

      <div className="overview-columns">
        <SectionCard
          title="How raw overrides combine with structured edits"
          description="The order of operations used by the ZIP builder."
          icon={<Info size={18} />}
        >
          <ol className="order-list">
            <li>
              <span>1</span>
              <div>
                <strong>Start with your raw override</strong>
                <p>If applied, the editor content replaces the original file in memory.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Apply solution settings</strong>
                <p>Version, managed flag and MissingDependencies removal are written next.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Apply environment values</strong>
                <p>
                  Edited values are written into <code>environmentvariablevalues.json</code> when present,
                  otherwise into <code>customizations.xml</code>.
                </p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>Validate and rebuild</strong>
                <p>Both XML files are validated again before the final ZIP is generated.</p>
              </div>
            </li>
          </ol>
        </SectionCard>

        <SectionCard
          title="Raw edit status"
          description="What will be used as the base for each file."
          icon={<ShieldCheck size={18} />}
        >
          <div className="raw-status-list">
            <div className="raw-status-row">
              <span>solution.xml</span>
              {edits.solutionXmlOverride ? <Badge tone="violet">Override applied</Badge> : <Badge tone="success">Original</Badge>}
            </div>
            <div className="raw-status-row">
              <span>customizations.xml</span>
              {edits.customizationsXmlOverride ? (
                <Badge tone="violet">Override applied</Badge>
              ) : (
                <Badge tone="success">Original</Badge>
              )}
            </div>
            <div className="raw-status-row">
              <span>MissingDependencies block</span>
              <Badge tone={edits.removeMissingDependencies ? 'danger' : 'neutral'}>
                {edits.removeMissingDependencies ? 'Will be removed' : 'Preserved'}
              </Badge>
            </div>
            <div className="raw-status-row">
              <span>Environment values</span>
              <Badge tone={Object.keys(edits.envVarValues).length > 0 ? 'violet' : 'neutral'}>
                {Object.keys(edits.envVarValues).length > 0
                  ? `${Object.keys(edits.envVarValues).length} overrides`
                  : 'No overrides'}
              </Badge>
            </div>
          </div>
          <div className="notice notice-info compact-notice">
            <span>
              Tip: download the original ZIP first if you plan aggressive XML edits. It is your rollback copy.
            </span>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
